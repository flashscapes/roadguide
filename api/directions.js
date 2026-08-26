export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Uses ONLY Places API (New) — the same product already enabled and
  // in active use elsewhere in this app (restaurants, Cool Stuff,
  // curated photo lookups). No Directions API, no separate Geocoding
  // API, no additional Google Cloud Console setup needed.
  //
  // Honest tradeoff: without Directions API, this can't know the
  // actual curving road path — it interpolates a straight line
  // between your location and the destination instead. For a
  // reasonably direct route this works well; for a route that curves
  // a lot (hugging a coastline, routing around a mountain), some
  // suggestions may land near the straight line but not exactly on
  // the real road.
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured." });
  }

  const { originLat, originLng, destination } = req.query;
  if (!originLat || !originLng || !destination) {
    return res.status(400).json({ error: "originLat, originLng, and destination are required." });
  }

  const originLatitude = Number(originLat);
  const originLongitude = Number(originLng);
  if (!Number.isFinite(originLatitude) || !Number.isFinite(originLongitude)) {
    return res.status(400).json({ error: "originLat/originLng must be valid numbers." });
  }

  try {
    // Resolve the free-text destination into coordinates via Places
    // Text Search — the exact same endpoint already used for curated
    // landmark photo lookups.
    const geocodeResponse = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "places.location,places.formattedAddress"
      },
      body: JSON.stringify({ textQuery: destination, maxResultCount: 1 })
    });
    const geocodeData = await geocodeResponse.json();
    const place = geocodeData.places && geocodeData.places[0];

    if (!place || !place.location) {
      return res.status(400).json({
        error: "Could not find that destination.",
        details: "NOT_FOUND"
      });
    }

    const destLat = place.location.latitude;
    const destLng = place.location.longitude;
    const distanceMiles = haversineMiles(originLatitude, originLongitude, destLat, destLng);

    // Interpolate ~6 evenly-spaced points along the straight line
    // between origin and destination for the frontend to search near.
    const targetCount = 6;
    const waypoints = [];
    for (let i = 0; i <= targetCount; i++) {
      const fraction = i / targetCount;
      waypoints.push({
        lat: originLatitude + (destLat - originLatitude) * fraction,
        lng: originLongitude + (destLng - originLongitude) * fraction
      });
    }

    return res.status(200).json({
      waypoints,
      distanceText: Math.round(distanceMiles) + " mi (straight-line)",
      durationText: null,
      destinationAddress: place.formattedAddress || destination
    });
  } catch (error) {
    console.error("Directions lookup error:", error);
    return res.status(500).json({ error: "Directions lookup failed.", details: error.message });
  }
}

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
