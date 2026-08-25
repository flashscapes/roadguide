export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) {
    return res.status(500).json({
      error: "GOOGLE_PLACES_API_KEY is not configured."
    });
  }

  const { lat, lng, radius = 8000 } = req.query;
  const latitude = Number(lat);
  const longitude = Number(lng);
  const searchRadius = Number(radius);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "Valid latitude and longitude are required." });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "Latitude or longitude is outside the valid range." });
  }

  const safeRadius = Math.min(Math.max(searchRadius || 8000, 100), 50000);

  // Valid Table A (filterable) landmark-style categories — verified
  // against Google's current Place Types (New) reference. "landmark"
  // itself is a Table B (response-only) type and can't be used here.
  const includedTypes = [
    "tourist_attraction",
    "historical_landmark",
    "historical_place",
    "cultural_landmark",
    "museum",
    "art_gallery",
    "national_park",
    "state_park",
    "park",
    "observation_deck",
    "visitor_center",
    "plaza",
    "sculpture",
    "zoo",
    "aquarium",
    "botanical_garden",
    "winery",
    "vineyard"
  ];

  const fieldMask =
    "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.websiteUri,places.types,places.photos";

  function searchNearby(rankPreference) {
    return fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": placesKey,
        "X-Goog-FieldMask": fieldMask
      },
      body: JSON.stringify({
        includedTypes: includedTypes,
        maxResultCount: 20,
        rankPreference: rankPreference,
        locationRestriction: {
          circle: {
            center: { latitude, longitude },
            radius: safeRadius
          }
        }
      })
    }).then((response) => response.json().then((data) => ({ response, data })));
  }

  try {
    const [distanceResult, popularityResult] = await Promise.all([
      searchNearby("DISTANCE"),
      searchNearby("POPULARITY")
    ]);

    if (!distanceResult.response.ok && !popularityResult.response.ok) {
      console.error("Google Places API error:", distanceResult.data, popularityResult.data);
      return res.status(distanceResult.response.status).json({
        error: "Google Places API request failed.",
        details: distanceResult.data.error?.message || distanceResult.data
      });
    }

    const distancePlaces = distanceResult.response.ok && Array.isArray(distanceResult.data.places)
      ? distanceResult.data.places : [];
    const popularityPlaces = popularityResult.response.ok && Array.isArray(popularityResult.data.places)
      ? popularityResult.data.places : [];

    const seenIds = new Set();
    const merged = [];
    for (const place of distancePlaces.concat(popularityPlaces)) {
      if (!place.id || seenIds.has(place.id)) continue;
      seenIds.add(place.id);
      merged.push(place);
    }

    const scored = merged
      .filter((place) => !place.businessStatus || place.businessStatus === "OPERATIONAL")
      .map((place) => {
        const rating = Number(place.rating || 0);
        const reviewCount = Number(place.userRatingCount || 0);
        const score = rating * 10 + Math.log10(reviewCount + 1) * 2;
        const photoRef =
          Array.isArray(place.photos) && place.photos.length && place.photos[0].name
            ? place.photos[0].name
            : null;

        return {
          id: place.id,
          name: place.displayName?.text || "",
          address: place.formattedAddress || "",
          latitude: place.location?.latitude ?? null,
          longitude: place.location?.longitude ?? null,
          rating: place.rating ?? null,
          reviewCount: place.userRatingCount ?? 0,
          googleMapsUri: place.googleMapsUri || null,
          websiteUri: place.websiteUri || null,
          types: place.types || [],
          photoRef: photoRef,
          _score: score
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 28)
      .map(({ _score, ...landmark }) => landmark);

    // Wikipedia lookups are free, so every landmark gets a shot at
    // fun facts, not just a cost-limited subset.
    const enriched = await Promise.all(
      scored.map((landmark) =>
        getWikipediaFunFacts(landmark.name)
          .then((funFacts) => Object.assign({}, landmark, { funFacts: funFacts }))
          .catch((err) => {
            console.error("Fun-fact lookup failed for", landmark.name, err);
            return Object.assign({}, landmark, { funFacts: null });
          })
      )
    );

    return res.status(200).json({ landmarks: enriched });

  } catch (error) {
    console.error("Landmark search error:", error);
    return res.status(500).json({
      error: "Landmark search failed.",
      details: error.message
    });
  }
}

// Looks up a real English Wikipedia summary for the landmark and
// returns the first two sentences of Wikipedia's OWN text, verbatim —
// no AI rewriting, no invented details. Returns null (never a guess)
// if no matching English article is found, or the source is too
// thin/ambiguous.
async function getWikipediaFunFacts(name) {
  try {
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=" +
      encodeURIComponent(name);
    const searchRes = await fetch(searchUrl, { headers: { "User-Agent": "RoadGuide/1.0 (https://github.com/flashscapes/roadguide)" } });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const title = searchData?.query?.search?.[0]?.title;
    if (!title) return null;

    const summaryUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title);
    const summaryRes = await fetch(summaryUrl, { headers: { "User-Agent": "RoadGuide/1.0 (https://github.com/flashscapes/roadguide)" } });
    if (!summaryRes.ok) return null;
    const summaryData = await summaryRes.json();
    const extract = summaryData.extract;
    // Disambiguation pages and stubs aren't reliable enough to use.
    if (!extract || extract.length < 60 || summaryData.type === "disambiguation") return null;

    return firstTwoSentences(extract);

  } catch (err) {
    console.error("getWikipediaFunFacts error:", err);
    return null;
  }
}

// Pulls the first two sentences out of a block of prose. Common
// abbreviations (U.S., St., Dr., Mt., etc.) are protected first so
// their periods aren't mistaken for sentence endings.
function firstTwoSentences(text) {
  const ABBR = /\b(U\.S|U\.K|St|Dr|Sr|Mr|Mrs|Ms|Jr|vs|etc|approx|No|Ave|Blvd|Mt|Ft|Rd|Co|Inc|Ltd)\./gi;
  const masked = text.replace(ABBR, (m) => m.replace(/\./g, "\u0000"));
  const sentences = masked.match(/[^.!?]+[.!?]+(?:\s|$)/g);
  const result = (!sentences || !sentences.length) ? masked.trim() : sentences.slice(0, 2).join("").trim();
  return result.replace(/\u0000/g, ".");
}
