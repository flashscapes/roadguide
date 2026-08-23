export default async function handler(req, res) {
  // Allow GET requests from RoadGuide
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  // Get the user's location from the request
  const { lat, lng, radius } = req.query;

  const latitude = Number(lat);
  const longitude = Number(lng);
  const searchRadius = Number(radius) || 5000;

  // Make sure we received valid coordinates
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return res.status(400).json({
      error: "Valid latitude and longitude are required."
    });
  }

  // Make sure the radius is reasonable
  const safeRadius = Math.min(Math.max(searchRadius, 100), 50000);

  // Your Google Places API key stays on the server.
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "GOOGLE_PLACES_API_KEY is not configured."
    });
  }

  try {
    const response = await fetch(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus,places.googleMapsUri,places.websiteUri,places.types"
        },
        body: JSON.stringify({
          includedTypes: ["restaurant"],
          maxResultCount: 20,
          rankPreference: "POPULARITY",
          locationRestriction: {
            circle: {
              center: {
                latitude: latitude,
                longitude: longitude
              },
              radius: safeRadius
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Google Places error:", data);

      return res.status(response.status).json({
        error: "Google Places request failed.",
        details: data
      });
    }

    // Convert Google's response into a simpler RoadGuide format
    const restaurants = (data.places || []).map((place) => ({
      id: place.id,
      name: place.displayName?.text || "Unnamed restaurant",
      address: place.formattedAddress || "",
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? 0,
      priceLevel: place.priceLevel ?? null,
      businessStatus: place.businessStatus ?? null,
      googleMapsUri: place.googleMapsUri || null,
      websiteUri: place.websiteUri || null,
      types: place.types || []
    }));

    return res.status(200).json({
      restaurants
    });

  } catch (error) {
    console.error("Restaurant API error:", error);

    return res.status(500).json({
      error: "Unable to search for restaurants.",
      details: error.message
    });
  }
}
