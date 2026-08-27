export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // HONEST DESIGN NOTE (mode="strict", the default): this endpoint
  // requires a real website AND real posted weekly hours AND a
  // currently-active status before a result qualifies at all — no
  // vague "maybe" listings. This means one-time annual festivals will
  // mostly disappear here (they don't fit into Google's weekly-hours
  // schema at all), while genuine weekly recurring things (a Thursday
  // food truck night, a Saturday farmers market) can work well IF the
  // organizer actually maintains their Google listing's hours —
  // coverage still depends entirely on that, which we have no way to
  // guarantee or predict.
  //
  // mode="general" is a much lighter bar (just rating + photo,
  // matching the relaxed 4.0/10-review floor used elsewhere for
  // Museums/Quirky/Scenic/Artsy) — used for general-discovery text
  // searches like "roadside attraction" or "mural", where requiring a
  // website/posted hours would incorrectly exclude almost everything,
  // since most such places simply don't have either.
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured." });
  }

  const { lat, lng, radius = 16093, queries, mode = "strict", allowSculpture } = req.query; // default ~10 miles
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

  const EXCLUDED_TYPES_BASE = new Set([
    "convenience_store", "supermarket", "shopping_mall", "department_store",
    "grocery_store", "gas_station", "parking", "parking_lot", "parking_garage",
    "sculpture", "monument"
  ]);
  const EXCLUDED_TYPES = (allowSculpture === "1" || allowSculpture === "true")
    ? new Set([...EXCLUDED_TYPES_BASE].filter((t) => t !== "sculpture" && t !== "monument"))
    : EXCLUDED_TYPES_BASE;

  try {
    const fieldMask = "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.businessStatus,places.googleMapsUri,places.websiteUri,places.types,places.photos,places.currentOpeningHours.openNow,places.currentOpeningHours.nextCloseTime,places.currentOpeningHours.nextOpenTime,places.regularOpeningHours.weekdayDescriptions";

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
        const hasPhoto = Array.isArray(place.photos) && place.photos.length > 0;

        if (mode === "general") {
          // Lighter bar — matches the relaxed floor used for
          // Museums/Quirky/Scenic/Artsy elsewhere. No website/hours
          // requirement, since a roadside oddity or mural rarely has
          // either.
          const rating = Number(place.rating || 0);
          const reviewCount = Number(place.userRatingCount || 0);
          return place.rating != null && rating >= 4.0 && reviewCount >= 10 && hasPhoto;
        }

        // STRICT bar (default), deliberately much tighter: a real
        // photo, a real website, real posted hours data, AND
        // currently marked open based on that schedule. This is what
        // actually distinguishes "a genuine weekly recurring thing
        // with a maintained Google listing" from "a stale or
        // annual-only entry we can't verify is happening at all" — if
        // any of these are missing, we simply don't know enough to
        // show it, so it's excluded rather than shown with a caveat.
        const hasWebsite = !!place.websiteUri;
        const hasRealHours = Array.isArray(place.regularOpeningHours?.weekdayDescriptions)
          && place.regularOpeningHours.weekdayDescriptions.length > 0;
        const isActiveNow = place.currentOpeningHours?.openNow === true;
        return place.rating != null && hasPhoto && hasWebsite && hasRealHours && isActiveNow;
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
          openNow: place.currentOpeningHours?.openNow === true,
          nextCloseTime: place.currentOpeningHours?.nextCloseTime || null,
          nextOpenTime: place.currentOpeningHours?.nextOpenTime || null,
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
