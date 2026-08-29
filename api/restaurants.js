// Standard great-circle distance in miles.
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Listing #1 = best candidate within 1 mile. Listing #2 = best NEW
// candidate within 2 miles (an expanding circle, not a disjoint
// ring — so a great place at 0.3mi can still land in slot #2 if
// slot #1 was already taken by something else nearby). Continues
// mile by mile up to maxTierMiles; if more results are still needed
// beyond that (sparse areas), fills remaining slots with the best
// remaining candidates regardless of tier, rather than searching an
// unreasonably large radius.
function buildProgressiveTierList(candidates, desiredCount, maxTierMiles) {
  const usedIds = new Set();
  const results = [];

  for (let mile = 1; mile <= maxTierMiles && results.length < desiredCount; mile++) {
    const inTier = candidates.filter((c) => c._dist <= mile && !usedIds.has(c.id));
    if (!inTier.length) continue;
    inTier.sort((a, b) => b._tierScore - a._tierScore);
    const best = inTier[0];
    usedIds.add(best.id);
    results.push(best);
  }

  if (results.length < desiredCount) {
    const remaining = candidates
      .filter((c) => !usedIds.has(c.id))
      .sort((a, b) => b._tierScore - a._tierScore);
    for (const c of remaining) {
      if (results.length >= desiredCount) break;
      results.push(c);
      usedIds.add(c.id);
    }
  }

  return results;
}

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
  const { lat, lng, radius = 5000, hidden, localVisiting, reviewedHidden, funInformative } = req.query;
  const hiddenMode = hidden === '1' || hidden === 'true';

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

  // The tiered ranking below needs real candidates out to ~20 miles
  // to work — a small radius would starve the later tiers. This
  // floor applies regardless of what's requested, since this
  // endpoint's whole purpose is now progressive geographic discovery,
  // not a simple small-radius nearby search.
  const safeRadius = Math.min(Math.max(searchRadius || 5000, 32187), 50000);

  try {
    const url = "https://places.googleapis.com/v1/places:searchNearby";

    const fieldMask =
      "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.businessStatus,places.googleMapsUri,places.websiteUri,places.types,places.outdoorSeating,places.reservable,places.delivery,places.takeout,places.currentOpeningHours.openNow,places.currentOpeningHours.nextCloseTime,places.currentOpeningHours.nextOpenTime,places.photos";

    // Google's Nearby Search (New) caps every single request at 20
    // results, no matter what maxResultCount is set to. To surface
    // more than 20 nearby restaurants, we fire two requests with
    // different ranking strategies (closest first, then most
    // popular first) and merge/dedupe the results below. This
    // typically yields a larger, still-relevant pool than either
    // request alone.
    function searchNearby(rankPreference) {
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask
        },
        body: JSON.stringify({
          includedTypes: ["restaurant"],
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

    // If BOTH requests failed, surface an error. If only one failed
    // (rare), fall back to whichever one succeeded.
    if (!distanceResult.response.ok && !popularityResult.response.ok) {
      console.error(
        "Google Places API error:",
        distanceResult.data,
        popularityResult.data
      );

      return res.status(distanceResult.response.status).json({
        error: "Google Places API request failed.",
        details: distanceResult.data.error?.message || distanceResult.data
      });
    }

    const distancePlaces = distanceResult.response.ok && Array.isArray(distanceResult.data.places)
      ? distanceResult.data.places
      : [];
    const popularityPlaces = popularityResult.response.ok && Array.isArray(popularityResult.data.places)
      ? popularityResult.data.places
      : [];

    // Merge the two result sets, deduping by place id so the same
    // restaurant returned by both searches only counts once.
    const seenIds = new Set();
    const places = [];
    for (const place of distancePlaces.concat(popularityPlaces)) {
      if (!place.id || seenIds.has(place.id)) continue;
      seenIds.add(place.id);
      places.push(place);
    }

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

    const scoredCandidates = places
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
      .filter((place) => {
        // Require a real rating — Google having at least one review
        // means a real person has vouched the place exists and is
        // roughly what it claims to be. Listings with no rating at
        // all tend to be low-quality/unverified entries with almost
        // no other information either (no hours, no reliable data).
        return place.rating != null;
      })
      .filter((place) => {
        // Also require an actual photo. A sparse listing (no hours,
        // no photo) reads as "broken" in the app even if it happens
        // to have a rating — requiring both gives a much stronger
        // floor on what actually gets shown.
        return Array.isArray(place.photos) && place.photos.length > 0;
      })
      .filter((place) => place.location?.latitude != null && place.location?.longitude != null)
      .map((place) => {
        const rating = Number(place.rating || 0);
        const reviewCount = Number(place.userRatingCount || 0);
        const dist = haversineMiles(latitude, longitude, place.location.latitude, place.location.longitude);

        // reviewedHidden (Preferences) subsumes the older hiddenMode
        // flag — both control the same underlying mechanism, kept
        // compatible so nothing already depending on ?hidden=1 breaks.
        const isHiddenPreference = hiddenMode || reviewedHidden === 'hidden';
        const isHighestReviewedPreference = reviewedHidden === 'highestReviewed';

        // Quality score — unchanged baseline (weight 2) regardless of
        // preference. The old approach varied this weight (0.2 / 2 / 4)
        // to express Highest Reviewed vs Hidden Gems, but that term is
        // dwarfed by rating*10 for most real result sets and rarely
        // changed which place won a tier. Replaced below with an
        // explicit bonus/penalty (reviewedHiddenAdj) — the same
        // "bonus AND penalty, not bonus-only" pattern already proven
        // to work for landmarks' Hidden Gems mode.
        const reviewScore = Math.log10(reviewCount + 1);
        const qualityScore = rating * 10 + reviewScore * 2;

        // reviewedHiddenAdj: a direct, tiered adjustment based on how
        // reviewed a place is — strong enough to reliably flip which
        // place wins a tier, not just nudge a small log-scaled term.
        // Zero for both branches when no preference is set, preserving
        // exact prior behavior.
        let reviewedHiddenAdj = 0;
        if (isHighestReviewedPreference) {
          if (reviewCount >= 1000) reviewedHiddenAdj += 15;
          else if (reviewCount >= 300) reviewedHiddenAdj += 10;
          else if (reviewCount >= 100) reviewedHiddenAdj += 5;
        } else if (isHiddenPreference) {
          if (reviewCount >= 1000) reviewedHiddenAdj -= 15;
          else if (reviewCount >= 300) reviewedHiddenAdj -= 8;
          else if (reviewCount < 50) reviewedHiddenAdj += 6; // reward genuine obscurity
        }

        // localVisiting: the old version only checked for the rare
        // "fine_dining_restaurant" / "fast_food_restaurant" / "cafe"
        // types, which most restaurants simply never get tagged with —
        // so it had almost no visible effect. priceLevel is present on
        // nearly every listing and is a far more universal proxy: a
        // "visiting" traveler skews toward pricier/more destination-
        // worthy spots, a "local" skews toward everyday/affordable
        // ones. Kept the original type-based bonus too, as a smaller
        // additional nudge when it does apply.
        const types = Array.isArray(place.types) ? place.types : [];
        const isFineDining = types.includes("fine_dining_restaurant");
        const isCasualLocal = types.includes("fast_food_restaurant") || types.includes("cafe");
        const PRICE_LEVEL_RANK = {
          PRICE_LEVEL_FREE: 0,
          PRICE_LEVEL_INEXPENSIVE: 1,
          PRICE_LEVEL_MODERATE: 2,
          PRICE_LEVEL_EXPENSIVE: 3,
          PRICE_LEVEL_VERY_EXPENSIVE: 4
        };
        const priceRank = Object.prototype.hasOwnProperty.call(PRICE_LEVEL_RANK, place.priceLevel)
          ? PRICE_LEVEL_RANK[place.priceLevel]
          : null;
        let localVisitingAdj = 0;
        if (localVisiting === 'visiting') {
          if (isFineDining) localVisitingAdj += 4;
          if (priceRank !== null) localVisitingAdj += priceRank * 2; // 0–8
        }
        if (localVisiting === 'local') {
          if (isCasualLocal) localVisitingAdj += 4;
          if (priceRank !== null) localVisitingAdj += (4 - priceRank) * 2; // 0–8
        }

        // funInformative: kept the existing cuisine-type signal (which
        // does have reasonable real-world coverage, since Google tags
        // specific cuisines fairly often) and layered on `reservable`
        // and `outdoorSeating` — two fields present across most
        // listings — as a second, broader signal. A reservable,
        // sit-down place reads as more of a deliberate "informative"
        // experience; outdoor seating reads as more casually "fun".
        const SPECIFIC_CUISINE_TYPES = new Set([
          "asian_restaurant", "brazilian_restaurant", "chinese_restaurant", "french_restaurant",
          "greek_restaurant", "indian_restaurant", "indonesian_restaurant", "italian_restaurant",
          "japanese_restaurant", "korean_restaurant", "mediterranean_restaurant", "mexican_restaurant",
          "spanish_restaurant", "thai_restaurant", "turkish_restaurant", "vietnamese_restaurant"
        ]);
        const isSpecificCuisine = types.some((t) => SPECIFIC_CUISINE_TYPES.has(t));
        const isSocialDining = types.includes("bar_and_grill") || types.includes("steak_house");
        let funInformativeAdj = 0;
        if (funInformative === 'informative') {
          if (isSpecificCuisine) funInformativeAdj += 4;
          if (place.reservable === true) funInformativeAdj += 3;
        }
        if (funInformative === 'fun') {
          if (isSocialDining) funInformativeAdj += 4;
          if (place.outdoorSeating === true) funInformativeAdj += 3;
        }

        // A modest proximity tiebreaker for use WITHIN a tier only —
        // this is what makes "closer wins when quality is similar"
        // true without letting proximity override real quality
        // differences. Distance itself is used separately as the
        // hard tier boundary below, not blended into this score.
        const proximityTiebreak = Math.max(0, 3 - dist * 0.5);
        const tierScore = qualityScore + proximityTiebreak + localVisitingAdj + funInformativeAdj + reviewedHiddenAdj;

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
          nextCloseTime:
            place.currentOpeningHours && place.currentOpeningHours.nextCloseTime
              ? place.currentOpeningHours.nextCloseTime
              : null,
          nextOpenTime:
            place.currentOpeningHours && place.currentOpeningHours.nextOpenTime
              ? place.currentOpeningHours.nextOpenTime
              : null,
          photoRef: photoRef,
          _dist: dist,
          _tierScore: tierScore
        };
      });

    // Progressive geographic expansion: listing #1 is the best
    // candidate within 1 mile, #2 is the best NEW candidate within 2
    // miles, and so on — never re-showing an already-picked place.
    // This is deliberately different from "sort everyone by score and
    // take the top 28": an excellent restaurant 3 miles away should
    // not bump a very good one 0.3 miles away out of an early slot.
    const restaurants = buildProgressiveTierList(scoredCandidates, 28, 20)
      .map(({ _dist, _tierScore, ...restaurant }) => restaurant);

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
