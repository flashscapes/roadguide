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

  // Categorized place types — verified against Google's current Place
  // Types (New) reference. Seven buckets, each with a base
  // significance "weight" that DOMINATES the scoring formula below —
  // this is what encodes "traveler relevance / iconic status /
  // uniqueness / local character" as PRIMARY ranking inputs, with
  // Google rating and distance only used as smaller secondary
  // adjustments (see the scoring comment further down for why).
  const EXPLORE_BUCKETS = [
    {
      key: "iconic",
      weight: 36,
      types: ["tourist_attraction", "national_park", "state_park"]
    },
    {
      key: "historical_cultural",
      weight: 33,
      types: ["historical_landmark", "historical_place", "cultural_landmark"]
    },
    {
      key: "unusual",
      // Distinctive/less-common venue types are the closest proxy
      // Places data offers for "quirky, memorable, unusual character"
      // — there's no literal "quirkiness" field to query on.
      weight: 30,
      types: ["comedy_club", "opera_house", "cultural_center", "performing_arts_theater", "planetarium", "amphitheatre", "concert_hall", "live_music_venue", "event_venue"]
    },
    {
      key: "local_market",
      weight: 27,
      types: ["market", "farmers_market", "winery", "vineyard", "plaza", "sculpture"]
    },
    {
      key: "museum_gallery",
      weight: 27,
      types: ["museum", "art_museum", "history_museum", "art_gallery"]
    },
    {
      key: "tours_activities",
      weight: 24,
      types: ["tour_agency", "amusement_park", "zoo", "aquarium"]
    },
    {
      key: "nature_scenic",
      weight: 24,
      types: ["park", "botanical_garden", "garden", "observation_deck", "visitor_center"]
    }
    // FUTURE: an "events" bucket (concerts, festivals, time-sensitive
    // listings from a source like Ticketmaster) can be added here
    // later — see the extensibility note above the scoring section
    // below for exactly where it plugs in. No other code needs to
    // change for that to work.
  ];

  const includedTypes = EXPLORE_BUCKETS.reduce((all, bucket) => all.concat(bucket.types), []);
  const BUCKET_WEIGHT = {};
  EXPLORE_BUCKETS.forEach((b) => { BUCKET_WEIGHT[b.key] = b.weight; });

  // Safety net — even within the types above, guard against Google
  // occasionally tagging an ordinary business with an overlapping
  // type (e.g. a plain grocery store sometimes carries "market").
  const EXCLUDED_TYPES = new Set([
    "convenience_store", "supermarket", "shopping_mall", "department_store",
    "grocery_store", "gas_station", "parking", "parking_lot", "parking_garage"
  ]);

  function bucketFor(placeTypes) {
    for (const bucket of EXPLORE_BUCKETS) {
      if (placeTypes.some((t) => bucket.types.includes(t))) return bucket.key;
    }
    return "other";
  }

  function milesBetween(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  const fieldMask =
    "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.websiteUri,places.types,places.photos,places.currentOpeningHours.openNow,places.currentOpeningHours.nextCloseTime,places.currentOpeningHours.nextOpenTime";

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

    let scored = merged
      .filter((place) => !place.businessStatus || place.businessStatus === "OPERATIONAL")
      .filter((place) => {
        const types = Array.isArray(place.types) ? place.types : [];
        return !types.some((t) => EXCLUDED_TYPES.has(t));
      })
      .filter((place) => {
        // Explore's floor is deliberately permissive — this is NOT
        // the "best of the best" cut, just a basic sanity check that
        // the place is real and has enough signal to trust (a photo,
        // a handful of reviews). The actual "best" determination
        // happens in scoring below, where traveler relevance/iconic
        // status/uniqueness/local character dominate — a genuinely
        // compelling but lesser-known spot with a 3.9 rating and 60
        // reviews should still be able to outrank a mediocre place
        // that merely has more reviews.
        const rating = Number(place.rating || 0);
        const reviewCount = Number(place.userRatingCount || 0);
        const hasPhoto = Array.isArray(place.photos) && place.photos.length > 0;
        return place.rating != null && rating >= 3.8 && reviewCount >= 50 && hasPhoto;
      })
      .map((place) => {
        const rating = Number(place.rating || 0);
        const reviewCount = Number(place.userRatingCount || 0);
        const openNow =
          place.currentOpeningHours && typeof place.currentOpeningHours.openNow === "boolean"
            ? place.currentOpeningHours.openNow
            : null;
        const bucket = bucketFor(place.types || []);
        const distanceMiles = (place.location?.latitude != null && place.location?.longitude != null)
          ? milesBetween(latitude, longitude, place.location.latitude, place.location.longitude)
          : null;

        // Scoring hierarchy, most to least influential:
        //   1-4. Traveler relevance / iconic status / uniqueness /
        //        local character — approximated by BUCKET_WEIGHT
        //        (26-34), which dominates the total. This is a
        //        deliberate choice: Places has no field for "iconic"
        //        or "quirky", so bucket membership (what KIND of
        //        place this is) is the best available proxy, and it
        //        is weighted far more heavily than anything below.
        //   5. Reputation/review quality — a much smaller secondary
        //      term (max ~+8.5 combined) so a merely well-reviewed
        //      place can't outrank a more significant one.
        //   6. Proximity — smallest term of all (max +3, floors at
        //      0), a gentle tie-breaker only. A mediocre-but-close
        //      place should not beat an exceptional-but-farther one.
        const typeWeight = BUCKET_WEIGHT[bucket] || 20;
        const qualityBonus = Math.max(0, (rating - 3.5)) * 3;       // ~0 to +4.5
        const reviewBonus = Math.log10(reviewCount + 1) * 0.8;      // ~0 to +4 at very high volume
        const openNowBonus = openNow === true ? 2 : 0;
        const proximityBonus = distanceMiles != null ? Math.max(0, 3 - distanceMiles * 0.2) : 0; // ~0 to +3

        const score = typeWeight + qualityBonus + reviewBonus + openNowBonus + proximityBonus;

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
          openNow: openNow,
          nextCloseTime: place.currentOpeningHours?.nextCloseTime || null,
          nextOpenTime: place.currentOpeningHours?.nextOpenTime || null,
          photoRef: photoRef,
          _bucket: bucket,
          _score: score
        };
      });

    // FUTURE EXTENSIBILITY: additional Explore sources (e.g. live
    // festivals/concerts from a source like Ticketmaster) can be
    // merged in right here. Any new source just needs to produce
    // objects in this same shape — id/name/address/lat/lon/rating/
    // photoRef/_bucket/_score — and get concat()'d onto `scored`
    // below, tagged with a bucket key such as "events". Nothing about
    // the diversity-selection algorithm below needs to change for
    // that to work — it already treats every bucket generically.
    //   const eventResults = await getNearbyEvents(latitude, longitude);
    //   scored = scored.concat(eventResults);

    // Diversity-aware selection: sort each of the 7 buckets internally
    // by score, then take results round-robin across buckets — round
    // 1 naturally yields "1 iconic, 1 historical/cultural, 1 unusual,
    // 1 local/market, 1 museum/gallery, 1 tour/activity, 1 nature/
    // scenic" (whichever buckets actually have qualifying results
    // nearby), then round 2 adds the next-best of each, and so on.
    // Without this, a city with 40 great museums and only 2 great
    // markets would show 28 museums and nothing else.
    const byBucket = {};
    for (const place of scored) {
      if (!byBucket[place._bucket]) byBucket[place._bucket] = [];
      byBucket[place._bucket].push(place);
    }
    Object.keys(byBucket).forEach((key) => byBucket[key].sort((a, b) => b._score - a._score));

    const bucketKeys = Object.keys(byBucket);
    const selected = [];
    let round = 0;
    while (selected.length < 28 && bucketKeys.some((key) => byBucket[key][round])) {
      for (const key of bucketKeys) {
        if (selected.length >= 28) break;
        if (byBucket[key][round]) selected.push(byBucket[key][round]);
      }
      round++;
    }

    const finalLandmarks = selected.map(({ _score, _bucket, ...landmark }) => landmark);

    // Wikipedia lookups are free, so every landmark gets a shot at
    // fun facts, not just a cost-limited subset.
    const enriched = await Promise.all(
      finalLandmarks.map((landmark) =>
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
