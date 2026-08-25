export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placesKey) {
    return res.status(500).json({
      error: "GOOGLE_PLACES_API_KEY is not configured."
    });
  }

  const { landmarks } = req.body || {};
  if (!Array.isArray(landmarks) || !landmarks.length) {
    return res.status(400).json({ error: "A non-empty 'landmarks' array is required." });
  }

  // Defensive cap — this endpoint is meant for "the ~28 cards currently
  // visible on screen", not the whole curated dataset at once.
  const batch = landmarks.slice(0, 30).filter((lm) =>
    lm && typeof lm.id !== "undefined" && typeof lm.name === "string" &&
    Number.isFinite(Number(lm.lat)) && Number.isFinite(Number(lm.lon))
  );

  if (!batch.length) {
    return res.status(400).json({ error: "No valid landmark entries (need id, name, lat, lon)." });
  }

  async function lookupOne(lm) {
    try {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": placesKey,
          "X-Goog-FieldMask": "places.photos,places.id"
        },
        body: JSON.stringify({
          textQuery: lm.name,
          maxResultCount: 1,
          locationBias: {
            circle: {
              center: { latitude: Number(lm.lat), longitude: Number(lm.lon) },
              radius: 8000
            }
          }
        })
      });

      if (!response.ok) return { id: lm.id, photoRef: null };

      const data = await response.json();
      const place = Array.isArray(data.places) ? data.places[0] : null;
      const photoRef =
        place && Array.isArray(place.photos) && place.photos.length && place.photos[0].name
          ? place.photos[0].name
          : null;

      return { id: lm.id, photoRef };

    } catch (err) {
      console.error("landmark-photos lookup failed for", lm.name, err);
      return { id: lm.id, photoRef: null };
    }
  }

  try {
    const results = await Promise.all(batch.map(lookupOne));
    return res.status(200).json({ photos: results });
  } catch (error) {
    console.error("landmark-photos batch error:", error);
    return res.status(500).json({ error: "Photo lookup failed.", details: error.message });
  }
}
