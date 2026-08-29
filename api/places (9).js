// Standard great-circle distance in miles.
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Same progressive-expansion algorithm as restaurants.js — listing #1
// is the best candidate within 1 mile, #2 the best NEW candidate
// within 2 miles, and so on. Used for Coffee Shops only; Bar/Food
// keeps its existing flat quality-sort, since only Restaurants and
// Coffee Shops were asked for this behavior.
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

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GOOGLE_PLACES_API_KEY is not configured."
    });
  }

  const { lat, lng, radius = 5000, type, localVisiting, reviewedHidden, funInformative } = req.query;

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

  // Same floor as restaurants.js and for the same reason — Coffee's
  // tiered ranking below needs real candidates out to ~20 miles.
  const safeRadius = Math.min(Math.max(searchRadius || 5000, 32187), 50000);

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

    const scoredCandidates = merged
      .filter((place) => !place.businessStatus || place.businessStatus === "OPERATIONAL")
      .filter((place) => place.rating != null)
      .filter((place) => Array.isArray(place.photos) && place.photos.length > 0)
      .filter((place) => place.location?.latitude != null && place.location?.longitude != null)
      .map((place) => {
        const rating = Number(place.rating || 0);
        const reviewCount = Number(place.userRatingCount || 0);
        const dist = haversineMiles(latitude, longitude, place.location.latitude, place.location.longitude);

        const isHiddenPreference = reviewedHidden === 'hidden';
        const isHighestReviewedPreference = reviewedHidden === 'highestReviewed';

        // Quality score — unchanged baseline (weight 2) regardless of
        // preference, same reasoning as restaurants.js: the old weight-
        // multiplier approach rarely changed which place actually won a
        // tier. Replaced with an explicit, tiered bonus/penalty below.
        const reviewScore = Math.log10(reviewCount + 1);
        const qualityScore = rating * 10 + reviewScore * 2;

        let reviewedHiddenAdj = 0;
        if (isHighestReviewedPreference) {
          if (reviewCount >= 1000) reviewedHiddenAdj += 15;
          else if (reviewCount >= 300) reviewedHiddenAdj += 10;
          else if (reviewCount >= 100) reviewedHiddenAdj += 5;
        } else if (isHiddenPreference) {
          if (reviewCount >= 1000) reviewedHiddenAdj -= 15;
          else if (reviewCount >= 300) reviewedHiddenAdj -= 8;
          else if (reviewCount < 50) reviewedHiddenAdj += 6;
        }

        // localVisiting for coffee/bar: kept the existing type-based
        // signal (coffee_roastery/tea_house/wine_bar/cocktail_bar read
        // as more destination-worthy; coffee_shop/pub/sports_bar/
        // irish_pub read as more everyday) and layered on priceLevel —
        // present on nearly every listing, unlike these specific types —
        // as a broader, more universal signal.
        const types = Array.isArray(place.types) ? place.types : [];
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
          if (types.includes('coffee_roastery') || types.includes('tea_house') || types.includes('wine_bar') || types.includes('cocktail_bar')) localVisitingAdj += 4;
          if (priceRank !== null) localVisitingAdj += priceRank * 2;
        }
        if (localVisiting === 'local') {
          if (types.includes('coffee_shop') || types.includes('pub') || types.includes('sports_bar') || types.includes('irish_pub')) localVisitingAdj += 4;
          if (priceRank !== null) localVisitingAdj += (4 - priceRank) * 2;
        }

        // funInformative (now labeled "Cultural" in the UI): broadened
        // beyond just brewery/brewpub/coffee_roastery to also include
        // tea_house, wine_bar, and irish_pub — all genuine heritage/
        // tradition-oriented venue types, which is the most honest
        // "cultural" signal available in this dataset. Still the
        // thinnest of the three categories (restaurants and landmarks
        // both have richer signals to draw on), but a real one.
        // outdoorSeating stays layered on as the broader "fun" signal.
        let funInformativeAdj = 0;
        if (funInformative === 'cultural' && (types.includes('brewery') || types.includes('brewpub') || types.includes('coffee_roastery') || types.includes('tea_house') || types.includes('wine_bar') || types.includes('irish_pub'))) funInformativeAdj += 4;
        if (funInformative === 'fun') {
          if (types.includes('sports_bar') || types.includes('cocktail_bar')) funInformativeAdj += 4;
          if (place.outdoorSeating === true) funInformativeAdj += 3;
        }

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
          _dist: dist,
          _tierScore: tierScore
        };
      });

    // Both Coffee and Bar/Food now get the progressive geographic
    // expansion (listing #1 best within 1mi, #2 best new within 2mi,
    // etc.) — same algorithm, same reasoning, applied uniformly.
    const places = buildProgressiveTierList(scoredCandidates, 28, 20)
      .map(({ _dist, _tierScore, ...place }) => place);

    return res.status(200).json({ places });

  } catch (error) {
    console.error("Places search error:", error);
    return res.status(500).json({
      error: "Places search failed.",
      details: error.message
    });
  }
}
