export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  // Allow GET requests only
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Google Places API key stored securely in Vercel — never sent to the browser
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GOOGLE_PLACES_API_KEY is not configured."
    });
  }

  // "ref" is a photo resource name like "places/XXXX/photos/YYYY",
  // returned by /api/restaurants as photoRef for each restaurant.
  const { ref, maxWidth = 400 } = req.query;

  if (!ref) {
    return res.status(400).json({
      error: "A photo reference (ref) is required."
    });
  }

  // Keep requested width within a sane range — this is a small
  // thumbnail proxy, not a full-resolution image server.
  const safeWidth = Math.min(
    Math.max(Number(maxWidth) || 400, 100),
    800
  );

  try {
    const googleUrl =
      `https://places.googleapis.com/v1/${ref}/media` +
      `?maxWidthPx=${encodeURIComponent(safeWidth)}` +
      `&key=${apiKey}`;

    const response = await fetch(googleUrl, { redirect: "follow" });

    if (!response.ok) {
      return res.status(response.status).json({
        error: "Failed to fetch photo from Google Places."
      });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    // Cache in the browser/CDN for a day — photos rarely change
    // and this avoids re-billing the same photo request repeatedly.
    res.setHeader("Cache-Control", "public, max-age=86400");

    return res.status(200).send(Buffer.from(arrayBuffer));

  } catch (error) {
    console.error("Photo proxy error:", error);

    return res.status(500).json({
      error: "Photo proxy failed.",
      details: error.message
    });
  }
}
