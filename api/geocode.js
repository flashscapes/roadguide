export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Uses ONLY Places API (New) Text Search — the same product and
  // pattern already in active use elsewhere in this app (directions.js
  // uses this exact same call to resolve its destination field). No
  // separate Geocoding API or additional Google Cloud Console setup
  // needed.
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured." });
  }

  const { query } = req.query;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: "query is required." });
  }

  try {
    const searchResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location,places.formattedAddress,places.displayName"
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 })
    });
    const searchData = await searchResponse.json();
    const place = searchData.places && searchData.places[0];

    if (!place || !place.location) {
      return res.status(404).json({
        error: "Could not find that place.",
        details: "NOT_FOUND"
      });
    }

    return res.status(200).json({
      lat: place.location.latitude,
      lng: place.location.longitude,
      formattedAddress: place.formattedAddress || (place.displayName && place.displayName.text) || query
    });
  } catch (error) {
    console.error("Geocode lookup error:", error);
    return res.status(500).json({ error: "Geocode lookup failed.", details: error.message });
  }
}
