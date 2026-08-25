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
    "botanical_garden"
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

    // Only ground/enrich the top slice with Wikipedia + Claude — doing
    // this for all 28 on every request would be slow and costly. The
    // rest still get name/photo/rating/directions, just no fun facts.
    const ENRICH_COUNT = 10;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    const enriched = await Promise.all(
      scored.map((landmark, i) => {
        if (i >= ENRICH_COUNT || !anthropicKey) {
          return Promise.resolve(Object.assign({}, landmark, { funFacts: null }));
        }
        return getGroundedFunFacts(landmark.name, anthropicKey)
          .then((funFacts) => Object.assign({}, landmark, { funFacts: funFacts }))
          .catch((err) => {
            console.error("Fun-fact generation failed for", landmark.name, err);
            return Object.assign({}, landmark, { funFacts: null });
          });
      })
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

// Looks up a real Wikipedia summary for the landmark, then asks Claude
// to condense ONLY that retrieved text into two engaging sentences.
// Returns null (never a guess) if no matching article is found, or if
// the source text is too thin to safely summarize.
async function getGroundedFunFacts(name, anthropicKey) {
  try {
    const searchUrl =
      "https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=" +
      encodeURIComponent(name);
    const searchRes = await fetch(searchUrl, { headers: { "User-Agent": "RoadGuide/1.0" } });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const title = searchData?.query?.search?.[0]?.title;
    if (!title) return null;

    const summaryUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(title);
    const summaryRes = await fetch(summaryUrl, { headers: { "User-Agent": "RoadGuide/1.0" } });
    if (!summaryRes.ok) return null;
    const summaryData = await summaryRes.json();
    const extract = summaryData.extract;
    // Disambiguation pages and stubs aren't reliable enough to summarize.
    if (!extract || extract.length < 60 || summaryData.type === "disambiguation") return null;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        system:
          "You write concise, engaging, traveler-oriented fun facts about landmarks. " +
          "You must use ONLY information present in the source text the user provides — " +
          "never add, infer, or embellish facts that aren't there. If the source doesn't " +
          "contain enough concrete detail, write fewer or more general sentences rather " +
          "than inventing anything. Output exactly two sentences. No preamble, no labels, " +
          "no quotation marks, no markdown.",
        messages: [
          {
            role: "user",
            content:
              "Source information about \"" + name + "\" (from Wikipedia):\n\n" + extract +
              "\n\nWrite exactly two concise, engaging, traveler-oriented sentences based only on this information."
          }
        ]
      })
    });

    if (!claudeRes.ok) {
      console.error("Claude API error:", await claudeRes.text());
      return null;
    }

    const claudeData = await claudeRes.json();
    const textBlock = Array.isArray(claudeData.content)
      ? claudeData.content.find((block) => block.type === "text")
      : null;
    const text = textBlock && textBlock.text ? textBlock.text.trim() : null;
    return text || null;

  } catch (err) {
    console.error("getGroundedFunFacts error:", err);
    return null;
  }
}
