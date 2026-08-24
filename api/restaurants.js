export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  // Allow GET requests only
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Google Places API key stored securely in Vercel
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GOOGLE_PLACES_API_KEY is not configured."
    });
  }

  // Read coordinates and radius from the request
  const { lat, lng, radius = 5000 } = req.query;

  const latitude = Number(lat);
  const longitude = Number(lng);
  const searchRadius = Number(radius);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return res.status(400).json({
      error: "Valid latitude and longitude are required."
    });
  }

  if (
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return res.status(400).json({
      error: "Latitude or longitude is outside the valid range."
    });
  }

  // Keep the search radius within Google's reasonable range
  const safeRadius = Math.min(
    Math.max(searchRadius || 5000, 100),
    50000
  );

  try {
    const url = "https://places.googleapis.com/v1/places:searchNearby";

    const requestBody = {
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: {
