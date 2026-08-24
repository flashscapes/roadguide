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
            latitude,
            longitude
          },
          radius: safeRadius
        }
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus,places.googleMapsUri,places.websiteUri,places.types,places.outdoorSeating,places.reservable,places.delivery,places.takeout,places.currentOpeningHours.openNow,places.currentOpeningHours.nextCloseTime,places.currentOpeningHours.nextOpenTime,places.photos"
      },
      body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Google Places API error:", data);

      return res.status(response.status).json({
        error: "Google Places API request failed.",
        details: data.error?.message || data
      });
    }

    const places = Array.isArray(data.places) ? data.places : [];

    // Types that indicate a place is probably NOT a restaurant,
    // even if Google also happens to classify it as a restaurant.
    const excludedTypes = new Set([
      "shopping_mall",
      "movie_theater",
      "department_store",
      "supermarket",
      "grocery_store",
      "clothing_store",
      "store",
      "shopping_center",
      "stadium",
      "concert_hall",
      "museum",
      "amusement_park",
      "tourist_attraction",
      "hotel",
      "lodging",
      "hospital",
      "school",
      "university",
      "airport",
      "gas_station",
      "car_dealer",
      "car_repair",
      "gym",
      "church",
      "park"
    ]);

    // Restaurant-related Google types that make us more confident
    // that the place is actually a restaurant.
    const restaurantTypes = new Set([
      "restaurant",
      "american_restaurant",
      "asian_restaurant",
      "bar_and_grill",
      "barbecue_restaurant",
      "brazilian_restaurant",
      "breakfast_restaurant",
      "brunch_restaurant",
      "cafe",
      "chinese_restaurant",
      "fast_food_restaurant",
      "fine_dining_restaurant",
      "french_restaurant",
      "greek_restaurant",
      "hamburger_restaurant",
      "indian_restaurant",
      "indonesian_restaurant",
      "italian_restaurant",
      "japanese_restaurant",
      "korean_restaurant",
      "mediterranean_restaurant",
      "mexican_restaurant",
      "pizza_restaurant",
      "seafood_restaurant",
      "spanish_restaurant",
      "steak_house",
      "sushi_restaurant",
      "thai_restaurant",
      "turkish_restaurant",
      "vegan_restaurant",
      "vegetarian_restaurant",
      "vietnamese_restaurant"
    ]);

    const restaurants = places
      .filter((place) => {
        const types = Array.isArray(place.types)
          ? place.types
          : [];

        // Reject businesses that have an obvious non-restaurant type.
        if (types.some((type) => excludedTypes.has(type))) {
          return false;
        }

        // Require at least one strong restaurant classification.
        return types.some((type) => restaurantTypes.has(type));
      })
      .filter((place) => {
        // Don't return closed businesses.
        return (
          !place.businessStatus ||
          place.businessStatus === "OPERATIONAL"
        );
      })
      .map((place) => {
        const rating = Number(place.rating || 0);
        const reviewCount = Number(place.userRatingCount || 0);

        // A modest popularity score that rewards both quality and
        // a meaningful number of reviews without allowing huge
        // review counts to completely overwhelm rating.
        const reviewScore = Math.log10(reviewCount + 1);

        const score =
          rating * 10 +
          reviewScore * 2;

        // Photo reference — used by the frontend to request an
        // actual image via the /api/photo proxy (keeps the API
        // key server-side only). Null when Google has no photo.
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
          priceLevel: place.priceLevel ?? null,
          businessStatus: place.businessStatus || null,
          googleMapsUri: place.googleMapsUri || null,
          websiteUri: place.websiteUri || null,
          types: place.types || [],

          // Fields used to build the Restaurant Snapshot bullets.
          // Each is only set when Google actually returned a value;
          // otherwise it stays null so the frontend can show an
          // honest "unknown" state instead of guessing.
          outdoorSeating:
            typeof place.outdoorSeating === "boolean"
              ? place.outdoorSeating
              : null,
          reservable:
            typeof place.reservable === "boolean"
              ? place.reservable
              : null,
          delivery:
            typeof place.delivery === "boolean"
              ? place.delivery
              : null,
          takeout:
            typeof place.takeout === "boolean"
              ? place.takeout
              : null,
          openNow:
            place.currentOpeningHours &&
            typeof place.currentOpeningHours.openNow === "boolean"
              ? place.currentOpeningHours.openNow
              : null,
          // ISO 8601 timestamps for the next close/open moment —
          // lets the frontend show "closes 10 PM" / "opens 8 AM"
          // rather than just a bare open/closed flag.
          nextCloseTime:
            place.currentOpeningHours && place.currentOpeningHours.nextCloseTime
              ? place.currentOpeningHours.nextCloseTime
              : null,
          nextOpenTime:
            place.currentOpeningHours && place.currentOpeningHours.nextOpenTime
              ? place.currentOpeningHours.nextOpenTime
              : null,

          photoRef: photoRef,

          _score: score
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 10)
      .map(({ _score, ...restaurant }) => restaurant);

    return res.status(200).json({
      restaurants
    });

  } catch (error) {
    console.error("Restaurant search error:", error);

    return res.status(500).json({
      error: "Restaurant search failed.",
      details: error.message
    });
  }
}
