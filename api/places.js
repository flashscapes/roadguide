export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GOOGLE_PLACES_API_KEY is not configured."
    });
  }

  const { lat, lng, radius = 5000, type } = req.query;

  const latitude = Number(lat);
  const longitude = Number(lng);
  const searchRadius = Number(radius);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "Valid latitude and longitude are required." });
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: "Latitude or longitude is outside the valid range." });
  }

  // Verified against Google's current Place Types (New) reference.
  const CATEGORIES = {
    coffee: {
      includedTypes: ["coffee_shop", "cafe", "coffee_roastery", "coffee_stand", "tea_house"]
    },
    bar: {
      includedTypes: ["bar", "bar_and_grill", "pub", "sports_bar", "wine_bar", "cocktail_bar", "brewery", "brewpub", "irish_pub", "gastropub"]
    }
  };

  const category = CATEGORIES[type];
  if (!category) {
    return res.status(400).json({ error: "Invalid or missing 'type' — must be 'coffee' or 'bar'." });
  }

  const safeRadius = Math.min(Math.max(searchRadius || 5000, 100), 50000);

  try {
    const url = "https://places.googleapis.com/v1/places:searchNearby";

    const fieldMask =
      "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus,places.googleMapsUri,places.websiteUri,places.types,places.outdoorSeating,places.currentOpeningHours.openNow,places.currentOpeningHours.nextCloseTime,places.currentOpeningHours.nextOpenTime,places.photos";

    // Same dual-search pattern already proven for restaurants: Google
    // caps every single Nearby Search at 20 results, so we fire one
    // distance-ranked and one popularity-ranked search and merge them.
    function searchNearby(rankPreference) {
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask
        },
        body: JSON.stringify({
          includedTypes: category.includedTypes,
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

    const places = merged
      .filter((place) => !place.businessStatus || place.businessStatus === "OPERATIONAL")
      .filter((place) => place.rating != null)
      .map((place) => {
        const rating = Number(place.rating || 0);
        const reviewCount = Number(place.userRatingCount || 0);
        const score = rating * 10 + Math.log10(reviewCount + 1) * 2;
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
          googleMapsUri: place.googleMapsUri || null,
          websiteUri: place.websiteUri || null,
          types: place.types || [],
          outdoorSeating: typeof place.outdoorSeating === "boolean" ? place.outdoorSeating : null,
          openNow:
            place.currentOpeningHours && typeof place.currentOpeningHours.openNow === "boolean"
              ? place.currentOpeningHours.openNow
              : null,
          nextCloseTime: place.currentOpeningHours?.nextCloseTime || null,
          nextOpenTime: place.currentOpeningHours?.nextOpenTime || null,
          photoRef: photoRef,
          _score: score
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 28)
      .map(({ _score, ...place }) => place);

    return res.status(200).json({ places });

  } catch (error) {
    console.error("Places search error:", error);
    return res.status(500).json({
      error: "Places search failed.",
      details: error.message
    });
  }
}
