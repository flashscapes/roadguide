export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // IMPORTANT HONEST LIMITATION: Places API (New) has no field for
  // event dates, times, or recurrence — verified directly against
  // Google's current field reference. It only knows about permanent
  // physical places. A "farmers market" or "street fair" result here
  // is a PLACE-LIKE entry Google's system has accumulated enough
  // reviews/photos to treat as persistent — it tells you such a thing
  // exists in the area, never whether it's happening today, this
  // weekend, or at all anymore. The frontend must always show that
  // caveat alongside these results, never present them as "happening
  // now".
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured." });
  }

  const { lat, lng, radius = 16093, queries } = req.query; // default ~10 miles
  if (!lat || !lng || !queries) {
    return res.status(400).json({ error: "lat, lng, and queries are required." });
  }

  const latitude = Number(lat);
  const longitude = Number(lng);
  const searchRadius = Number(radius);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "lat/lng must be valid numbers." });
  }

  // Comma-separated list of text queries, e.g. "farmers market" or
  // "festival,street festival,art fair,craft fair,block party".
  const queryList = String(queries).split(',').map((q) => q.trim()).filter(Boolean).slice(0, 12);
  if (!queryList.length) {
    return res.status(400).json({ error: "At least one query term is required." });
  }

  const EXCLUDED_TYPES = new Set([
    "convenience_store", "supermarket", "shopping_mall", "department_store",
    "grocery_store", "gas_station", "parking", "parking_lot", "parking_garage",
    "sculpture", "monument"
  ]);

  try {
    const fieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.websiteUri,places.types,places.photos";

    const searches = queryList.map((textQuery) =>
      fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask
        },
        body: JSON.stringify({
          textQuery,
          maxResultCount: 10,
          locationBias: {
            circle: { center: { latitude, longitude }, radius: Math.min(Math.max(searchRadius, 1000), 50000) }
          }
        })
      })
        .then((r) => (r.ok ? r.json() : { places: [] }))
        .then((d) => (Array.isArray(d.places) ? d.places : []))
        .catch(() => [])
    );

    const resultsPerQuery = await Promise.all(searches);

    const seen = new Set();
    const merged = [];
    resultsPerQuery.forEach((list) => {
      list.forEach((place) => {
        if (!place.id || seen.has(place.id)) return;
        seen.add(place.id);
        merged.push(place);
      });
    });

    const finalPlaces = merged
      .filter((place) => !place.businessStatus || place.businessStatus === "OPERATIONAL")
      .filter((place) => {
        const types = Array.isArray(place.types) ? place.types : [];
        return !types.some((t) => EXCLUDED_TYPES.has(t));
      })
      .filter((place) => {
        // Deliberately more permissive than the main quality bar
        // elsewhere in this app — these are often small, community-run
        // institutions with modest review counts, and the goal here
        // is comprehensive discovery, not "best of the best".
        const hasPhoto = Array.isArray(place.photos) && place.photos.length > 0;
        return place.rating != null && hasPhoto;
      })
      .map((place) => {
        const photoRef = Array.isArray(place.photos) && place.photos.length && place.photos[0].name
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
          photoRef
        };
      })
      .slice(0, 20);

    return res.status(200).json({ places: finalPlaces });
  } catch (error) {
    console.error("Text search error:", error);
    return res.status(500).json({ error: "Text search failed.", details: error.message });
  }
}
