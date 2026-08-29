// ─────────────────────────────────────────────────────────
// BUILD MASTER LANDMARK ARRAY FROM ALL LOADED JS FILES
// Handles: LANDMARKS, LANDMARKS_SOUTH, LANDMARKS_SOUTHWEST,
// LANDMARKS_TOPUP, LANDMARKS_VALLEY, FILM_LANDMARKS
// ─────────────────────────────────────────────────────────

var ALL_LANDMARKS = (function() {
  var seen = {};
  var out  = [];

  function norm(lm) {
    var lat = (lm.lat != null) ? lm.lat : (lm.coords ? lm.coords.lat : null);
    var lon = (lm.lon != null) ? lm.lon
            : (lm.coords ? (lm.coords.lon != null ? lm.coords.lon : lm.coords.lng) : null);
    var photo = lm.photo || lm.image || '';
    var fact = lm.fact || '';
    if (!fact && lm.media) {
      fact = '<div class="film-row"><span class="film-label">🎬 Movie</span><span class="film-val">' + (lm.media || '') + '</span></div>'
           + '<div class="film-row"><span class="film-label">🎥 The Scene</span><span class="film-val">' + (lm.scene || lm.history || '') + '</span></div>'
           + '<div class="film-row"><span class="film-label">⭐ Fun Fact</span><span class="film-val">' + (lm.fun_fact || '') + '</span></div>';
    }
    var cat = lm.cat || '';
    if (!cat && lm.media) cat = 'Movie & TV Film';
    return {
      name:   lm.name   || '',
      county: lm.county || '',
      emoji:  lm.emoji  || '📍',
      lat:    lat,
      lon:    lon,
      cat:    cat,
      photo:  photo,
      fact:   fact
    };
  }

  function merge(arr) {
    if (!arr || !arr.length) return;
    for (var i = 0; i < arr.length; i++) {
      var n   = norm(arr[i]);
      if (!n.lat || !n.lon || !n.name) continue;
      var key = n.name.toLowerCase().trim();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(n);
    }
  }

  if (typeof LANDMARKS             !== 'undefined') merge(LANDMARKS);
  if (typeof LANDMARKS_SOUTH       !== 'undefined') merge(LANDMARKS_SOUTH);
  if (typeof LANDMARKS_SOUTHWEST   !== 'undefined') merge(LANDMARKS_SOUTHWEST);
  if (typeof LANDMARKS_TOPUP       !== 'undefined') merge(LANDMARKS_TOPUP);
  if (typeof LANDMARKS_VALLEY      !== 'undefined') merge(LANDMARKS_VALLEY);
  if (typeof FILM_LANDMARKS        !== 'undefined') merge(FILM_LANDMARKS);

  return out;
})();

document.getElementById('tc').textContent = ALL_LANDMARKS.length;

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
var userLat         = null;
var userLon         = null;
var sorted          = [];
var overlayLandmark = null;
var activeCategory  = 'restaurants';

// Restaurant state
var restaurantResults  = [];
var restaurantsLoaded  = false;
var restaurantsLoading = false;

// World landmark state (worldwide, Places-powered — separate from
// your curated ALL_LANDMARKS California dataset). This is now used
// exclusively as Explore's automatic live fallback (see sortAndRender)
// rather than a separate selectable tab.
var worldLandmarkResults  = [];
var worldLandmarksLoaded  = false;
var worldLandmarksLoading = false;

// "Explore" blends your curated county stories WITH live worldwide
// results into one ranked list, using the SAME scoring system as the
// live side (api/landmarks.js) so both compete fairly. This replaces
// the old 50-mile binary switch — a curated landmark 45 miles away
// now just scores low via its own proximity term, rather than either
// being shown regardless of relevance (inside 50mi) or hidden
// entirely (outside it). Weights and formula intentionally mirror
// api/landmarks.js exactly — if you tune one, tune the other.
var EXPLORE_BUCKET_WEIGHTS = {
  iconic: 36, historical_cultural: 33, unusual: 30,
  local_market: 27, museum_gallery: 27, tours_activities: 24, nature_scenic: 24
};

// ─────────────────────────────────────────────────────────
// PREFERENCES — session-only ranking weights (never hard filters).
// Verified extensively before implementation: with no preference
// set, every scoring formula below produces mathematically identical
// results to the pre-Preferences production formulas — confirmed via
// direct numeric comparison, not just reasoning. When a preference
// IS set, it reorders results (sometimes substantially) but never
// removes a place from contention entirely.
//
// Not persisted across app reloads — a plain in-memory object is
// enough to satisfy "active during the current session", and there
// was no existing persistence mechanism for user selections to reuse
// (confirmed during investigation: Mood selection itself isn't
// persisted anywhere either, just read from the dropdown at time of
// use).
// ─────────────────────────────────────────────────────────
// Safe localStorage helpers — wrapped in try/catch since localStorage
// can throw in rare cases (private browsing, storage disabled). Falls
// back to "no persisted value" gracefully rather than ever breaking
// the app.
function roadtipStorageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function roadtipStorageSet(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch (e) { /* ignore — persistence is a nice-to-have, not critical */ }
}

var activePreferences = {
  localVisiting:  roadtipStorageGet('roadtip_pref_localVisiting'),
  reviewedHidden: roadtipStorageGet('roadtip_pref_reviewedHidden'),
  funInformative: roadtipStorageGet('roadtip_pref_funInformative')
};

// Restore the visual state of the three chip rows to match, so the
// UI honestly reflects what's already active rather than showing no
// selection while secretly having a preference applied.
(function restorePreferenceChips() {
  var map = {
    localVisiting:  activePreferences.localVisiting,
    reviewedHidden: activePreferences.reviewedHidden,
    funInformative: activePreferences.funInformative
  };
  Object.keys(map).forEach(function(prefKey) {
    var value = map[prefKey];
    if (!value) return;
    var row = document.querySelector('.chipRow[data-pref="' + prefKey + '"]');
    if (!row) return;
    var chip = row.querySelector('.prefChip[data-value="' + value + '"]');
    if (chip) chip.classList.add('active');
  });
  updatePreferencesDoneState();
})();

function hasAnyActivePreference() {
  return !!(activePreferences.localVisiting || activePreferences.reviewedHidden || activePreferences.funInformative);
}

// Builds the query string fragment sent to restaurants.js/places.js.
// Empty when no preference is set — those endpoints already default
// to their exact original behavior when these params are absent.
function preferencesQueryString() {
  var parts = [];
  if (activePreferences.localVisiting)  parts.push('localVisiting=' + encodeURIComponent(activePreferences.localVisiting));
  if (activePreferences.reviewedHidden) parts.push('reviewedHidden=' + encodeURIComponent(activePreferences.reviewedHidden));
  if (activePreferences.funInformative) parts.push('funInformative=' + encodeURIComponent(activePreferences.funInformative));
  return parts.length ? '&' + parts.join('&') : '';
}

function togglePreferencesPanel() {
  var panel = document.getElementById('preferencesPanel');
  if (!panel) return;
  var isOpen = panel.style.display === 'flex';
  if (isOpen) {
    closePreferencesPanel(); // closing via the toggle button counts as "done" too
  } else {
    panel.style.display = 'flex';
  }
}

// Lights up the Done button once all three chip rows have a
// selection — purely visual, does not gate whether Done is
// clickable (Done always works; fewer than three is still allowed).
function updatePreferencesDoneState() {
  var doneBtn = document.getElementById('preferencesDoneBtn');
  if (!doneBtn) return;
  var allSet = activePreferences.localVisiting && activePreferences.reviewedHidden && activePreferences.funInformative;
  doneBtn.classList.toggle('ready', !!allSet);
}

// Handles a tap on any preference chip. Only updates the visual
// selection, in-memory state, and persisted storage — it deliberately
// does NOT re-rank/refresh results. That happens once, when the panel
// closes (see applyActivePreferences), so picking "Visiting" doesn't
// instantly re-run a search before the other two choices are made.
function onPreferenceChipClick(chipEl) {
  var row = chipEl.parentElement;
  var prefKey = row.getAttribute('data-pref');
  var value = chipEl.getAttribute('data-value');

  // Tapping the already-active chip in a row clears that row back to
  // unset, matching the old dropdown's "Select…" option — otherwise
  // a user could never revert a preference back to neutral.
  var alreadyActive = chipEl.classList.contains('active');
  var chips = row.querySelectorAll('.prefChip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
  if (!alreadyActive) chipEl.classList.add('active');

  activePreferences[prefKey] = alreadyActive ? null : value;

  // Persist immediately — overwrites the previous value on change,
  // removes the stored key entirely if a value is ever cleared back
  // to empty (roadtipStorageSet already handles both cases). Saving
  // to storage is harmless to do right away; it's only the visible
  // re-ranking of results that waits for Done.
  roadtipStorageSet('roadtip_pref_localVisiting', activePreferences.localVisiting);
  roadtipStorageSet('roadtip_pref_reviewedHidden', activePreferences.reviewedHidden);
  roadtipStorageSet('roadtip_pref_funInformative', activePreferences.funInformative);

  updatePreferencesDoneState();

  // No auto-close here, even if all three are now set. Persisted
  // preferences (from a prior session) mean two of three are often
  // already set, so changing just the third one used to satisfy this
  // "all three set" condition and fire an unwanted refresh before the
  // user meant to finish. Only an explicit Done tap (or dismissing
  // via the toggle button, in closePreferencesPanel) applies/re-ranks
  // now — no implicit shortcut.
}

// Re-ranks/refreshes whatever is currently on screen so the effect of
// the finished preference selections becomes visible — never requires
// a full app reload. Only the currently active category needs to
// react; nothing else is touched, and no unnecessary API calls are
// made for categories the user isn't even looking at right now. Only
// called when the preferences panel closes (Done tapped, all three
// chips set, or the toggle button used to close it) — never on a
// single mid-selection chip tap.
function applyActivePreferences() {
  if (activeCategory === 'restaurants') {
    restaurantsLoaded = false; restaurantsLoading = false;
    loadRestaurants();
  } else if (activeCategory === 'coffee' || activeCategory === 'bar') {
    var state = PLACE_CATEGORIES[activeCategory];
    if (state) { state.loaded = false; state.loading = false; }
    loadPlacesCategory(activeCategory);
  } else if (activeCategory === 'hookmeup') {
    var hmuSelect = document.getElementById('hookMeUpSelect');
    if (hmuSelect && hmuSelect.value) loadHookMeUpMood(hmuSelect.value);
  } else if (activeCategory === 'dopedetours') {
    var ddInput = document.getElementById('dopeDetoursInput');
    if (ddInput && ddInput.value.trim()) loadDopeDetours(ddInput.value.trim());
  }
}

function closePreferencesPanel() {
  var panel = document.getElementById('preferencesPanel');
  if (panel) panel.style.display = 'none';
  applyActivePreferences();
}

// Landmarks-based preference adjustment (Museums/Quirky/Scenic/Artsy
// under Hidden Gems). Bonuses AND penalties, not bonus-only — an
// earlier bonus-only design was tested and found insufficient (a
// massively-famous landmark stayed #1 under every preference,
// including ones that should have demoted it) before this version
// was verified to actually work.
function landmarkPreferenceAdjustment(bucket, isFun) {
  var adj = 0;
  var p = activePreferences;
  if (p.localVisiting === 'visiting' && (bucket === 'iconic' || bucket === 'historical_cultural')) adj += 10;
  if (p.localVisiting === 'local') {
    if (bucket === 'local_market') adj += 10;
    if (bucket === 'iconic') adj -= 10;
  }
  if (p.funInformative === 'informative' && (bucket === 'historical_cultural' || bucket === 'museum_gallery')) adj += 10;
  if (p.funInformative === 'fun' && (bucket === 'unusual' || bucket === 'tours_activities' || isFun)) adj += 10;
  // Being the single most iconic type of place is itself a signal of
  // NOT being a hidden gem — pure review de-emphasis alone was
  // tested and found insufficient on its own.
  if (p.reviewedHidden === 'hidden' && bucket === 'iconic') adj -= 8;
  return adj;
}

function landmarkReviewWeight() {
  if (activePreferences.reviewedHidden === 'hidden') return 0.4;
  if (activePreferences.reviewedHidden === 'highestReviewed') return 4;
  return 2; // exact existing default when no preference is set
}

function landmarkEffectiveReviewCount(reviewCount) {
  // A soft cap, not just a smaller multiplier — a place with tens of
  // thousands of reviews still produces a large log-scaled term even
  // at a reduced weight, which was the actual root cause of the
  // bonus-only design failing verification earlier.
  if (activePreferences.reviewedHidden === 'hidden') return Math.min(reviewCount, 500);
  return reviewCount;
}

// Curated landmarks have no Google rating/review data — they were
// deliberately hand-picked, which is itself a signal of quality. This
// fixed value approximates roughly what a genuinely good, well-known
// live place would score on reputation (~4.5 rating, ~1000 reviews),
// so curated entries aren't unfairly zeroed out on that dimension.
var CURATED_REPUTATION_BONUS = 5.4;

function curatedBucketFor(lm) {
  var cat = (lm.cat || '').toLowerCase();
  if (/movie|tv|film|theater|theatre/.test(cat)) return 'unusual';
  if (/winery|wine|vineyard|wine region|market|fairground/.test(cat)) return 'local_market';
  if (/^museum$|^science center$|^planetarium$|^aquarium$|^space center$|^zoo$|^observatory$|^history museum$|^art museum$|^children.s museum$/.test(cat)) return 'museum_gallery';
  if (/trail|route|railway|parkway/.test(cat)) return 'tours_activities';
  if (/natural|geological|wetland|marsh|lagoon|estuary|waterway|mountain|reservoir|lake|valley|open space|forest|bay|dune|canyon|wilderness|waterfall|feature|creek|river|natural area|park|preserve|recreation|garden|beach|shoreline|cove|coast|wildlife|refuge|bird|animal|slough/.test(cat)) return 'nature_scenic';
  if (/historic|fort|ruin|memorial|cemetery|adobe|landmark|shipyard|powder|arsenal|ranch|district|neighborhood|hotel|town|building|farm|ship|prison|ruins|hacienda|estate|mission|military|naval|army/.test(cat)) return 'historical_cultural';
  return 'iconic'; // unmatched cats default to iconic — it was curated deliberately, so treat it as notable
}

function curatedIsFun(lm) {
  return /winery|wine|vineyard|amusement|zoo|aquarium|music|concert|comedy|opera/.test((lm.cat || '').toLowerCase());
}

// Mirrors the live scoring formula in api/landmarks.js exactly,
// operating on a curated landmark instead of a Places result.
// Beyond this distance, a curated landmark isn't a realistic
// suggestion no matter how significant it is — this is what actually
// stops a California landmark from competing for a slot when you're
// in London. It's deliberately generous (a long day-trip range, well
// beyond the old 50-mile switch) since curated entries are worth
// knowing about even a bit of a drive away — but it's a real ceiling,
// not the old "floors at 0 past 15mi and just stays there forever"
// gap that let any distance beyond 15mi score identically.
var EXPLORE_CURATED_MAX_MILES = 150;

function scoreCuratedForExplore(lm) {
  var bucket = curatedBucketFor(lm);
  var typeWeight = EXPLORE_BUCKET_WEIGHTS[bucket] || 24;
  var distanceMiles = (userLat !== null && userLon !== null && lm.lat != null && lm.lon != null)
    ? haversine(userLat, userLon, lm.lat, lm.lon) : null;
  if (distanceMiles != null && distanceMiles > EXPLORE_CURATED_MAX_MILES) {
    return { bucket: bucket, score: -1, dist: distanceMiles, tooFar: true };
  }
  var proximityBonus = distanceMiles != null ? Math.max(0, 4 - distanceMiles * 0.2) : 0;
  var funBonus = curatedIsFun(lm) ? 4 : 0;
  var score = typeWeight + CURATED_REPUTATION_BONUS + proximityBonus + funBonus;
  return { bucket: bucket, score: score, dist: distanceMiles };
}

// Cache of the ORIGINAL #cards markup (the card0...card6 placeholders
// from index.html), captured once before any restaurant rendering
// ever touches the DOM. Restaurants view replaces #cards.innerHTML
// entirely, which destroys card0-card6 — without this cache, switching
// back to a normal category afterwards has nothing to render into and
// the view appears frozen on Restaurants.
var cardsOriginalHTML = (function() {
  var cardsEl = document.getElementById('cards');
  return cardsEl ? cardsEl.innerHTML : null;
})();

// ─────────────────────────────────────────────────────────
// ADD RESTAURANTS CATEGORY BUTTON
// ─────────────────────────────────────────────────────────
(function addRestaurantsChip() {
  var catScroll = document.getElementById('catScroll');
  if (!catScroll) return;
  if (document.getElementById('restaurantsChip')) return;
  var btn = document.createElement('button');
  btn.id = 'restaurantsChip';
  btn.className = 'cat-chip active';
  btn.textContent = '🍴 Restaurants';
  btn.onclick = function() { setCat('restaurants', btn); };
  // 1st chip
  catScroll.insertBefore(btn, catScroll.children[0] || null);
})();

// ─────────────────────────────────────────────────────────
// ADD COFFEE SHOPS & BAR/FOOD CATEGORY BUTTONS (worldwide,
// Places-powered) — inserted right after Restaurants, per request.
// ─────────────────────────────────────────────────────────
(function addCoffeeAndBarChips() {
  var catScroll = document.getElementById('catScroll');
  if (!catScroll) return;

  if (!document.getElementById('coffeeChip')) {
    var coffeeBtn = document.createElement('button');
    coffeeBtn.id = 'coffeeChip';
    coffeeBtn.className = 'cat-chip';
    coffeeBtn.textContent = '☕ Coffee Shops';
    coffeeBtn.onclick = function() { setCat('coffee', coffeeBtn); };
    // 2nd chip (right after Restaurants)
    catScroll.insertBefore(coffeeBtn, catScroll.children[1] || null);
  }

  if (!document.getElementById('barChip')) {
    var barBtn = document.createElement('button');
    barBtn.id = 'barChip';
    barBtn.className = 'cat-chip';
    barBtn.textContent = '🍺 Bar/Food';
    barBtn.onclick = function() { setCat('bar', barBtn); };
    // 3rd chip (right after Coffee Shops)
    catScroll.insertBefore(barBtn, catScroll.children[2] || null);
  }
})();

// ─────────────────────────────────────────────────────────
// CATEGORY FILTER
// ─────────────────────────────────────────────────────────
function setCat(cat, el) {
  var chips = document.querySelectorAll('.cat-chip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
  el.classList.add('active');
  var evPane = document.getElementById('eventsPane');
  var cards  = document.getElementById('cards');
  var sep    = document.querySelector('.sep');
  var list   = document.getElementById('list');
  var lbl    = document.getElementById('listLabel');
  var listen = document.getElementById('listenWrap');
  var hookMeUpPicker = document.getElementById('hookMeUpPicker');
  var dopeDetoursPicker = document.getElementById('dopeDetoursPicker');
  if (cat === 'restaurants' || cat === 'coffee' || cat === 'bar') {
    if (hookMeUpPicker) hookMeUpPicker.style.display = 'none';
    if (dopeDetoursPicker) dopeDetoursPicker.style.display = 'none';
    if (evPane)  evPane.classList.remove('active');
    if (cards)   cards.style.display  = '';
    if (sep)     sep.style.display    = '';
    if (list)    list.style.display   = '';
    if (lbl)     lbl.style.display    = '';
    if (listen)  listen.style.display = '';
    activeCategory = cat;
    if (cat === 'restaurants') loadRestaurants();
    else loadPlacesCategory(cat);
    return;
  }
  if (cat === 'hookmeup') {
    if (dopeDetoursPicker) dopeDetoursPicker.style.display = 'none';
    if (evPane)  evPane.classList.remove('active');
    if (cards)   cards.style.display  = '';
    if (sep)     sep.style.display    = 'none';
    if (list)    list.style.display   = 'none';
    if (lbl)     lbl.style.display    = 'none';
    if (listen)  listen.style.display = '';
    activeCategory = cat;
    if (hookMeUpPicker) hookMeUpPicker.style.display = '';
    var hmuSelect = document.getElementById('hookMeUpSelect');
    var savedMood = roadtipStorageGet('roadtip_hiddenGemsMood');
    if (savedMood && hmuSelect) {
      // Restore the previous mood, pre-filled (not blank), and load
      // its results immediately — the picker STAYS visible so the
      // user can still see and easily change their mood, rather than
      // being stuck once a mood is saved.
      hmuSelect.value = savedMood;
      loadHookMeUpMood(savedMood);
    } else {
      if (hmuSelect) hmuSelect.value = '';
      if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">Pick a mood above to get 3-5 recommendations</div></div>';
      setMsg('Choose a mood above');
    }
    return;
  }
  if (cat === 'dopedetours') {
    if (hookMeUpPicker) hookMeUpPicker.style.display = 'none';
    if (evPane)  evPane.classList.remove('active');
    if (cards)   cards.style.display  = '';
    if (sep)     sep.style.display    = 'none';
    if (list)    list.style.display   = 'none';
    if (lbl)     lbl.style.display    = 'none';
    if (listen)  listen.style.display = '';
    activeCategory = cat;
    if (dopeDetoursPicker) dopeDetoursPicker.style.display = '';
    var ddInput = document.getElementById('dopeDetoursInput');
    if (ddInput) ddInput.value = '';
    var ddRouteInfo = document.getElementById('dopeDetoursRouteInfo');
    if (ddRouteInfo) ddRouteInfo.textContent = '';
    if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">Type a destination above to find stops along the way</div></div>';
    setMsg('Enter a destination above');
    return;
  }
  if (hookMeUpPicker) hookMeUpPicker.style.display = 'none';
  if (dopeDetoursPicker) dopeDetoursPicker.style.display = 'none';
  // If arriving here from Restaurants, #cards no longer contains
  // card0-card6 (renderRestaurantCards overwrote them). Restore the
  // original placeholder markup so renderCards() has elements again.
  if (cards && cardsOriginalHTML !== null && !document.getElementById('card0')) {
    cards.innerHTML = cardsOriginalHTML;
  }
  if (cat === 'events') {
    if (evPane)  evPane.classList.add('active');
    if (cards)   cards.style.display  = 'none';
    if (sep)     sep.style.display    = 'none';
    if (list)    list.style.display   = 'none';
    if (lbl)     lbl.style.display    = 'none';
    if (listen)  listen.style.display = 'none';
    loadEvents();
    activeCategory = null;
    return;
  } else {
    if (evPane)  evPane.classList.remove('active');
    if (cards)   cards.style.display  = '';
    if (sep)     sep.style.display    = '';
    if (list)    list.style.display   = '';
    if (lbl)     lbl.style.display    = '';
    if (listen)  listen.style.display = '';
  }
  if (cat === 'events') {
    activeCategory = null;
  } else {
    activeCategory = cat;
    sortAndRender();
  }
}

function getFiltered() {
  if (!activeCategory) return ALL_LANDMARKS;
  if (activeCategory === 'restaurants' || activeCategory === 'coffee' || activeCategory === 'bar' || activeCategory === 'hookmeup' || activeCategory === 'dopedetours') return [];
  var c = activeCategory;
  return ALL_LANDMARKS.filter(function(lm) {
    var cat = (lm.cat || '').toLowerCase();
    if (c === 'historic')   return /historic|fort|ruin|memorial|cemetery|adobe|plaza|landmark|shipyard|powder|arsenal|ranch|district|neighborhood|hotel|theater|theatre|town|building|farm|ship|prison|ruins|hacienda|estate/.test(cat);
    if (c === 'nature')     return /natural|geological|wetland|marsh|lagoon|estuary|waterway|mountain|reservoir|lake|valley|open space|forest|bay|dune|canyon|wilderness|waterfall|feature|creek|river|natural area/.test(cat);
    if (c === 'winery')     return /winery|wine|vineyard|wine region/.test(cat);
    if (c === 'beach')      return /beach|shoreline|cove|coast/.test(cat);
    if (c === 'park')       return /park|preserve|recreation|garden/.test(cat);
    if (c === 'trail')      return /trail|route|railway|parkway/.test(cat);
    if (c === 'wildlife')   return /wildlife|refuge|bird|animal|wetland|slough/.test(cat);
    if (c === 'military')   return /military|naval|army|prison|ship|fort/.test(cat);
    if (c === 'lighthouse') return /lighthouse/.test(cat);
    if (c === 'geological') return /geological|fault|volcanic|geo|mine|quicksilver/.test(cat);
    if (c === 'mission')    return /mission/.test(cat);
    if (c === 'industrial') return /industrial|refinery|infrastructure|facility|airport|stadium|factory|plant|power/.test(cat);
    if (c === 'education')  return /education|university|college|campus|school/.test(cat);
    if (c === 'market')     return /market|fairground/.test(cat);
    if (c === 'energy')     return /energy|wind|power/.test(cat);
    return false;
  });
}

// ─────────────────────────────────────────────────────────
// GPS — starts automatically, re-sorts on every position fix
// ─────────────────────────────────────────────────────────
function startGPS() {
  if (!navigator.geolocation) {
    setDot('err');
    setMsg('Location not available — showing all landmarks');
    sortAndRender();
    return;
  }
  setDot('gps');
  setMsg('Acquiring GPS…');
  navigator.geolocation.watchPosition(onPos, onErr, {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 20000
  });
}

// GPS can fire far more often than anything actually needs to
// re-render — jitter/noise alone can trigger many updates a minute
// even standing still. The debug HUD text always updates in real
// time (cheap), but the expensive part (re-filtering/re-sorting
// curated categories, re-triggering their async photo lookups,
// Explore's blend) only runs if you've genuinely moved a meaningful
// distance or enough time has passed — not on every single tick.
var lastProcessedGpsTime = 0;
var lastProcessedGpsLat  = null;
var lastProcessedGpsLon  = null;
var GPS_UPDATE_MIN_INTERVAL_MS    = 4000;
var GPS_UPDATE_MIN_DISTANCE_MILES = 0.03; // ~150 feet

function shouldProcessGpsUpdate(lat, lon) {
  if (lastProcessedGpsLat === null) return true; // always process the first fix
  if (Date.now() - lastProcessedGpsTime >= GPS_UPDATE_MIN_INTERVAL_MS) return true;
  return haversine(lastProcessedGpsLat, lastProcessedGpsLon, lat, lon) >= GPS_UPDATE_MIN_DISTANCE_MILES;
}

function onPos(pos) {
  // Real GPS is always recorded here so "Current GPS Location" can
  // restore it instantly. It only overwrites userLat/userLon (the
  // single variable every search/distance calc in the app reads
  // from) when dev test-location mode is NOT active.
  realGpsLat = pos.coords.latitude;
  realGpsLon = pos.coords.longitude;
  if (devTestLat === null) {
    userLat = realGpsLat;
    userLon = realGpsLon;
  }
  document.getElementById('gLat').textContent = 'LAT ' + userLat.toFixed(4);
  document.getElementById('gLon').textContent = 'LON ' + userLon.toFixed(4);
  document.getElementById('gSpd').textContent = (pos.coords.speed != null)
    ? 'SPD ' + (pos.coords.speed * 2.237).toFixed(1) + ' mph' : 'SPD —';
  document.getElementById('gAcc').textContent = 'ACC ±' + Math.round(pos.coords.accuracy) + 'm';
  setDot('live');

  if (!shouldProcessGpsUpdate(userLat, userLon)) return;
  lastProcessedGpsTime = Date.now();
  lastProcessedGpsLat  = userLat;
  lastProcessedGpsLon  = userLon;

  if (activeCategory === 'restaurants') {
    if (!restaurantsLoaded && !restaurantsLoading) loadRestaurants();
    return;
  }
  if (activeCategory === 'coffee' || activeCategory === 'bar') {
    var pcState = PLACE_CATEGORIES[activeCategory];
    if (pcState && !pcState.loaded && !pcState.loading) loadPlacesCategory(activeCategory);
    return;
  }
  if (activeCategory === 'hookmeup') {
    // No auto-load on GPS ticks — Hook Me Up waits for an explicit
    // mood selection rather than loading anything automatically.
    return;
  }
  if (activeCategory === 'dopedetours') {
    // Same treatment — waits for an explicit destination + Go press.
    return;
  }
  if (!activeCategory) {
    // Explore, same treatment as the tabs above: load once, then
    // leave it alone. Re-running the full blend+render+photo-fetch
    // cycle on every GPS tick (even tiny drift) was racing against
    // the async curated-photo lookup — an older in-flight fetch would
    // resolve after a newer render had already replaced the DOM
    // elements it was targeting, silently dropping photos.
    if (!worldLandmarksLoaded && !worldLandmarksLoading) loadWorldLandmarks();
    return;
  }
  sortAndRender();
}

function onErr(e) {
  setDot('err');
  setMsg('Location unavailable — showing all landmarks');
  sortAndRender();
}

// ─────────────────────────────────────────────────────────
// DISTANCE + BEARING MATH
// ─────────────────────────────────────────────────────────
function haversine(la1, lo1, la2, lo2) {
  var R    = 3958.8;
  var dLa  = (la2 - la1) * Math.PI / 180;
  var dLo  = (lo2 - lo1) * Math.PI / 180;
  var a    = Math.sin(dLa / 2) * Math.sin(dLa / 2)
           + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180)
           * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return R * 2 * Math.asin(Math.sqrt(a));
}

function bearing(la1, lo1, la2, lo2) {
  var dLo  = (lo2 - lo1) * Math.PI / 180;
  var y    = Math.sin(dLo) * Math.cos(la2 * Math.PI / 180);
  var x    = Math.cos(la1 * Math.PI / 180) * Math.sin(la2 * Math.PI / 180)
           - Math.sin(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.cos(dLo);
  var deg  = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  var dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// ─────────────────────────────────────────────────────────
// SORT & RENDER
// ─────────────────────────────────────────────────────────
function sortAndRender() {
  if (activeCategory === 'restaurants') {
    renderRestaurants();
    return;
  }
  if (activeCategory === 'coffee' || activeCategory === 'bar') {
    renderPlacesCategory(activeCategory);
    return;
  }
  if (activeCategory === 'hookmeup') {
    // Nothing to re-render here — results only change when a mood is
    // explicitly picked (onHookMeUpMoodChange), not on generic
    // re-render triggers.
    return;
  }
  if (activeCategory === 'dopedetours') {
    // Same — results only change on an explicit Go press.
    return;
  }
  if (!activeCategory) {
    // "Explore": blends curated county stories WITH live worldwide
    // results into ONE ranked list — see renderWorldLandmarks() below
    // (kept under its old name so loadWorldLandmarks's existing
    // callback doesn't need touching, but it now does full blending,
    // not just live-only rendering). No more distance gate — live
    // results are fetched every time, and curated entries compete on
    // the same score scale instead of being switched on/off.
    if (!worldLandmarksLoaded && !worldLandmarksLoading) {
      loadWorldLandmarks();
      return;
    }
    renderWorldLandmarks();
    return;
  }
  var base = getFiltered();

  if (userLat !== null) {
    sorted = base.map(function(lm) {
      return Object.assign({}, lm, {
        dist: haversine(userLat, userLon, lm.lat, lm.lon),
        dir:  bearing(userLat, userLon, lm.lat, lm.lon)
      });
    });
    sorted.sort(function(a, b) { return a.dist - b.dist; });

    var nearest = sorted[0] ? sorted[0].dist : 99;
    document.getElementById('scanfill').style.width =
      Math.min(100, Math.round(100 / (nearest + 1))) + '%';

    var nearby = sorted.filter(function(l) { return l.dist < 5; }).length;
    document.getElementById('dc').textContent = nearby;
    setMsg(sorted.length + ' landmarks · sorted by distance');
  } else {
    sorted = base.slice();
    document.getElementById('dc').textContent = '—';
    setMsg(sorted.length + ' landmarks loaded');
  }

  var countEl = document.getElementById('catCount');
  countEl.textContent = activeCategory
    ? sorted.length + ' landmark' + (sorted.length !== 1 ? 's' : '') + ' in this category'
    : '';

  renderCards();
  renderList();
  loadCuratedPhotos(sorted.slice(0, HERO_COUNT + 13));
}

// Looks up real, verified Google Places photos for the landmarks
// currently on screen and swaps them in for the emoji placeholder
// once they arrive. Runs after the cards already rendered, so the
// view is never blocked waiting on this — it's a progressive upgrade,
// not a requirement for the cards to appear.
function loadCuratedPhotos(landmarks) {
  if (!landmarks || !landmarks.length) return;

  var payload = landmarks.map(function(lm, i) {
    return { id: (lm.id != null ? lm.id : i), name: lm.name, county: lm.county || '', lat: lm.lat, lon: lm.lon };
  });

  fetch('https://roadguide-lime.vercel.app/api/landmark-photos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ landmarks: payload })
  })
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      var photos = Array.isArray(data.photos) ? data.photos : [];
      photos.forEach(function(p) {
        var slot = p ? document.getElementById('curatedPhotoSlot' + p.id) : null;
        if (!slot) return;

        if (!p.photoRef) {
          // No real photo found for this specific listing — omit it
          // entirely rather than leaving a permanent emoji card.
          var card = slot.closest('.card');
          if (card && card.parentNode) card.parentNode.removeChild(card);
          return;
        }

        if (!slot.parentNode) return;
        var photoUrl = 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(p.photoRef) + '&maxWidth=300';
        var img = document.createElement('img');
        img.className = 'card-img';
        img.alt = '';
        img.loading = 'lazy';
        img.onload = function() { slot.style.display = 'none'; };
        img.onerror = function() {
          // The photo URL itself failed to load (broken/expired
          // reference) — same "omit, don't show a broken card" rule.
          img.remove();
          var card2 = slot.closest('.card');
          if (card2 && card2.parentNode) card2.parentNode.removeChild(card2);
        };
        img.src = photoUrl;
        slot.parentNode.insertBefore(img, slot);
      });
    })
    .catch(function(error) {
      // A failed request means we genuinely don't know whether these
      // have real photos — and "no photo" always means "omit", with
      // no exceptions, so treat total failure the same as individual
      // not-found: remove every pending card in this batch rather
      // than leaving them stuck showing an emoji indefinitely.
      console.error('Curated landmark photo lookup failed:', error);
      landmarks.forEach(function(lm, i) {
        var id = (lm.id != null ? lm.id : i);
        var slot = document.getElementById('curatedPhotoSlot' + id);
        if (!slot) return;
        var card = slot.closest('.card');
        if (card && card.parentNode) card.parentNode.removeChild(card);
      });
    });
}

// ─────────────────────────────────────────────────────────
// RENDER TOP 7 CARDS (full size)
// ─────────────────────────────────────────────────────────
var HERO_COUNT = 7;
var ORDINAL_LABEL = ['▲ NEAREST', '▲ 2ND NEAREST', '▲ 3RD NEAREST', '▲ 4TH NEAREST', '▲ 5TH NEAREST', '▲ 6TH NEAREST', '▲ 7TH NEAREST'];

function renderCards() {
  for (var i = 0; i < HERO_COUNT; i++) {
    var el = document.getElementById('card' + i);
    var lm = sorted[i];
    if (!lm) {
      el.className  = 'card';
      el.innerHTML  = '<div class="card-placeholder">No landmarks in this category</div>';
      continue;
    }
    el.className = 'card rank-' + (i + 1);
    var distStr  = (lm.dist != null) ? lm.dist.toFixed(1) : '—';
    var dirStr   = lm.dir  || '';
    // NOTE: the static lm.photo field is no longer used here — many of
    // these URLs were never verified against real files and 404
    // silently. Cards show the emoji immediately, then
    // loadCuratedPhotos() swaps in a real, verified photo when it
    // arrives (see below).
    el.innerHTML = '<div class="card-emoji" id="curatedPhotoSlot' + i + '" style="display:flex">' + lm.emoji + '</div>'
      + '<div class="card-body">'
      +   '<div class="card-top">'
      +     '<div class="card-meta">'
      +       '<div class="card-rank">' + (ORDINAL_LABEL[i] || ('▲ #' + (i + 1))) + '</div>'
      +       '<div class="card-name">' + escHtml(lm.name) + '</div>'
      +       '<div class="card-county">' + escHtml(lm.county) + (lm.cat ? ' · ' + escHtml(lm.cat) : '') + '</div>'
      +     '</div>'
      +     '<div class="card-dist-wrap">'
      +       '<div class="card-dist">' + distStr + '</div>'
      +       '<span class="card-unit">MILES</span>'
      +       '<div class="card-dir">'  + dirStr  + '</div>'
      +     '</div>'
      +   '</div>'
      +   '<div class="divider"></div>'
      +   '<div class="card-fact">' + lm.fact + '</div>'
      + '<br><br><a class="yt-link" href="https://www.youtube.com/results?search_query=' + encodeURIComponent(lm.name) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:14px;">&#9654; Watch on YouTube</a>'
      + '</div>';
  }
}

// ─────────────────────────────────────────────────────────
// RENDER SCROLLABLE LIST — same card layout, ~80% scale (rank 8+)
// ─────────────────────────────────────────────────────────
function renderList() {
  var list  = document.getElementById('list');
  var items = sorted.slice(HERO_COUNT, HERO_COUNT + 13);
  if (!items.length) {
    list.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:8px 0">No additional landmarks in this category</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var lm  = items[i];
    var idx = i + HERO_COUNT;
    var distStr = (lm.dist != null) ? lm.dist.toFixed(1) : '—';
    var dirStr  = lm.dir || '';
    // See note in renderCards() — static lm.photo is unreliable and
    // no longer used; loadCuratedPhotos() fills in a verified photo.
    html += '<div class="card card-mid" onclick="openOverlay(' + idx + ')">'
          +   '<div class="card-emoji" id="curatedPhotoSlot' + idx + '" style="display:flex">' + lm.emoji + '</div>'
          +   '<div class="card-body">'
          +     '<div class="card-top">'
          +       '<div class="card-meta">'
          +         '<div class="card-rank">▲ #' + (idx + 1) + ' NEAREST</div>'
          +         '<div class="card-name">' + escHtml(lm.name) + '</div>'
          +         '<div class="card-county">' + escHtml(lm.county) + (lm.cat ? ' · ' + escHtml(lm.cat) : '') + '</div>'
          +       '</div>'
          +       '<div class="card-dist-wrap">'
          +         '<div class="card-dist">' + distStr + '</div>'
          +         '<span class="card-unit">MILES</span>'
          +         '<div class="card-dir">' + dirStr + '</div>'
          +       '</div>'
          +     '</div>'
          +     '<div class="divider"></div>'
          +     '<div class="card-fact">' + lm.fact + '</div>'
          +   '</div>'
          + '</div>';
  }
  list.innerHTML = html;
}

// ─────────────────────────────────────────────────────────
// VOICE ENGINE — iPhone-optimized browser TTS
// ─────────────────────────────────────────────────────────

var _speaking = false;

function xiSpeak(text, onStart, onEnd) {
  xiStop();
  browserSpeak(text, onStart, onEnd);
  return true;
}

function xiStop() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  _speaking = false;
}

function browserSpeak(text, onStart, onEnd) {
  if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }
  window.speechSynthesis.cancel();
  var utt  = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 0.88;
  utt.pitch = 1.0;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIOS) {
    var voices = window.speechSynthesis.getVoices();
    var v = voices.find(function(v){ return v.name === 'Google US English'; })
         || voices.find(function(v){ return v.name.toLowerCase().indexOf('google') !== -1 && v.lang === 'en-US'; })
         || voices.find(function(v){ return v.lang === 'en-US' && v.localService; })
         || voices.find(function(v){ return v.lang === 'en-US'; });
    if (v) utt.voice = v;
  }
  utt.onstart = function() { _speaking = true; if (onStart) onStart(); };
  utt.onend   = function() { _speaking = false; if (onEnd) onEnd(); };
  utt.onerror = function() { _speaking = false; if (onEnd) onEnd(); };
  setTimeout(function() {
    window.speechSynthesis.speak(utt);
  }, isIOS ? 100 : 0);
}

function isSpeaking() {
  return _speaking || (window.speechSynthesis && window.speechSynthesis.speaking);
}

// ── Voice dropdown — hidden on iOS, visible on desktop ──
var selectedVoice = null;

function populateVoices() {
  if (!window.speechSynthesis) return;
  var voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var wrap  = document.getElementById('voiceWrap');
  if (isIOS) {
    if (wrap) wrap.style.display = 'none';
    return;
  }
  var sel = document.getElementById('voiceSelect');
  if (!sel) return;
  sel.innerHTML = '';
  var sorted_voices = voices.slice().sort(function(a, b) {
    return ((b.lang === 'en-US') ? 1 : 0) - ((a.lang === 'en-US') ? 1 : 0);
  });
  sorted_voices.forEach(function(v) {
    var opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name + ' (' + v.lang + ')';
    sel.appendChild(opt);
  });
  var saved = localStorage.getItem('rg_voice');
  var chosen = (saved ? voices.find(function(v){ return v.name === saved && v.lang === 'en-US'; }) : null)
             || voices.find(function(v){ return v.name === 'Google US English'; })
             || voices.find(function(v){ return v.lang === 'en-US'; })
             || voices[0];
  sel.value     = chosen ? chosen.name : '';
  selectedVoice = chosen || null;
}

function saveVoice() {
  var sel = document.getElementById('voiceSelect');
  if (!sel || !window.speechSynthesis) return;
  selectedVoice = window.speechSynthesis.getVoices().find(function(v){ return v.name === sel.value; }) || null;
  try { localStorage.setItem('rg_voice', sel.value); } catch(e) {}
}

function getVoice() {
  var sel  = document.getElementById('voiceSelect');
  var name = sel ? sel.value : '';
  if (!name || !window.speechSynthesis) return null;
  return window.speechSynthesis.getVoices().find(function(v){ return v.name === name; }) || null;
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = populateVoices;
  populateVoices();
}

// ─────────────────────────────────────────────────────────
// RESTAURANT API
// ─────────────────────────────────────────────────────────
function loadRestaurants() {
  if (restaurantsLoading) return;
  if (userLat === null || userLon === null) {
    setMsg('Waiting for your GPS location…');
    var waitTimer = setInterval(function() {
      if (userLat !== null && userLon !== null) {
        clearInterval(waitTimer);
        loadRestaurants();
      }
    }, 500);
    return;
  }
  restaurantsLoading = true;
  restaurantsLoaded  = false;
  setMsg('Searching for nearby restaurants…');
  var url = 'https://roadguide-lime.vercel.app/api/restaurants?lat=' + encodeURIComponent(userLat)
          + '&lng=' + encodeURIComponent(userLon) + '&radius=5000'
          + preferencesQueryString();
  fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      restaurantsLoading = false;
      restaurantsLoaded  = true;
      restaurantResults  = Array.isArray(data.restaurants) ? data.restaurants : [];
      renderRestaurants();
    })
    .catch(function(error) {
      restaurantsLoading = false;
      restaurantsLoaded  = false;
      console.error('Restaurant loading error:', error);
      restaurantResults = [];
      setMsg('Could not load restaurants — ' + error.message);
      renderRestaurantMessage('Could not load nearby restaurants. Please try again.');
    });
}

// ─────────────────────────────────────────────────────────
// RESTAURANT SNAPSHOT (3-bullet cuisine / outdoor seating / detail)
// ─────────────────────────────────────────────────────────
var CUISINE_LABELS = {
  american_restaurant: 'American', asian_restaurant: 'Asian', bar_and_grill: 'Bar & grill',
  barbecue_restaurant: 'Barbecue', brazilian_restaurant: 'Brazilian', breakfast_restaurant: 'Breakfast',
  brunch_restaurant: 'Brunch', cafe: 'Cafe', chinese_restaurant: 'Chinese',
  fast_food_restaurant: 'Fast food', fine_dining_restaurant: 'Fine dining', french_restaurant: 'French',
  greek_restaurant: 'Greek', hamburger_restaurant: 'Burgers', indian_restaurant: 'Indian',
  indonesian_restaurant: 'Indonesian', italian_restaurant: 'Italian', japanese_restaurant: 'Japanese',
  korean_restaurant: 'Korean', mediterranean_restaurant: 'Mediterranean', mexican_restaurant: 'Mexican',
  pizza_restaurant: 'Pizza', seafood_restaurant: 'Seafood', spanish_restaurant: 'Spanish',
  steak_house: 'Steakhouse', sushi_restaurant: 'Sushi', thai_restaurant: 'Thai',
  turkish_restaurant: 'Turkish', vegan_restaurant: 'Vegan', vegetarian_restaurant: 'Vegetarian',
  vietnamese_restaurant: 'Vietnamese'
};

function restaurantCuisineBullet(r) {
  var types = Array.isArray(r.types) ? r.types : [];
  for (var i = 0; i < types.length; i++) {
    if (CUISINE_LABELS[types[i]]) return CUISINE_LABELS[types[i]];
  }
  // No specific cuisine type from Google — fall back to the first
  // non-generic type it gave us (title-cased) rather than just
  // repeating the word "Restaurant".
  var generic = { restaurant: true, food: true, point_of_interest: true, establishment: true };
  for (var j = 0; j < types.length; j++) {
    if (!generic[types[j]]) {
      return types[j].replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }
  }
  return 'Restaurant';
}

function restaurantHoursTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function restaurantHoursBullet(r) {
  if (r.openNow === true) {
    var closeTime = restaurantHoursTime(r.nextCloseTime);
    return closeTime ? 'Open now · Closes ' + closeTime : 'Open now';
  }
  if (r.openNow === false) {
    var openTime = restaurantHoursTime(r.nextOpenTime);
    return openTime ? 'Closed now · Opens ' + openTime : 'Closed now';
  }
  return 'Hours unknown';
}

// Human-readable site name (e.g. "chezpanisse.com") instead of a
// generic "Website & menu" label.
function restaurantSiteLabel(uri) {
  try {
    var host = new URL(uri).hostname.replace(/^www\./, '');
    return host;
  } catch (e) {
    return uri;
  }
}

function restaurantOutdoorBullet(r) {
  if (r.outdoorSeating === true)  return 'Outdoor seating available';
  if (r.outdoorSeating === false) return 'Outdoor seating not listed';
  return 'Outdoor seating unknown';
}

function restaurantRatingBullet(r) {
  var parts = [];
  if (r.rating != null) {
    var count = Number(r.reviewCount || 0);
    parts.push('★ ' + Number(r.rating).toFixed(1) + (count ? ' (' + count.toLocaleString() + ' reviews)' : ''));
  }
  var price = restaurantPrice(r.priceLevel);
  if (price) parts.push(price);
  return parts.length ? parts.join(' · ') : 'No rating available';
}

// Compact "at-a-glance" info panel — icon + value rows with color
// and weight doing the hierarchy work, not a generic bulleted list.
// Fixed order: cuisine, hours, outdoor seating, rating. Website and
// directions are NOT here — they render as separate full-width
// action rows below (see restaurantActionsHTML), styled as
// intentional tap targets rather than inline bullet links.
function restaurantSnapshotHTML(r) {
  var isOpen   = r.openNow === true;
  var isClosed = r.openNow === false;
  var hoursClass = isOpen ? 'open' : (isClosed ? 'closed' : '');

  var rows = [
    { cls: 'cuisine',  ico: '🍽️', val: escHtml(restaurantCuisineBullet(r)) },
    { cls: hoursClass, ico: '🕐', val: escHtml(restaurantHoursBullet(r)) },
    { cls: '',         ico: '🌳', val: escHtml(restaurantOutdoorBullet(r)) },
    { cls: 'rating',   ico: '★',  val: escHtml(restaurantRatingBullet(r)) }
  ];

  return '<div class="rest-panel">'
       + rows.map(function(row) {
           return '<div class="rest-row' + (row.cls ? ' ' + row.cls : '') + '">'
                +   '<span class="rest-ico">' + row.ico + '</span>'
                +   '<span class="rest-val">' + row.val + '</span>'
                + '</div>';
         }).join('')
       + '</div>';
}

// Two full-width, tap-friendly action rows shown below the facts
// panel — Directions (primary, gold) always shown, Website
// (secondary, muted) only shown when a real website exists.
function restaurantActionsHTML(r) {
  var lat = (r.latitude  != null) ? Number(r.latitude)  : NaN;
  var lon = (r.longitude != null) ? Number(r.longitude) : NaN;
  var directionsUrl = null;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lon)
        + (r.id ? '&destination_place_id=' + encodeURIComponent(r.id) : '');
  } else if (r.address) {
    directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(r.address);
  }

  var directionsHTML = directionsUrl
    ? '<a class="rest-action rest-action-primary" href="' + escHtml(directionsUrl) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
      +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
      +   '<span class="rest-action-label">Directions</span>'
      + '</a>'
    : '<div class="rest-action rest-action-primary rest-action-disabled">'
      +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
      +   '<span class="rest-action-label">Directions unavailable</span>'
      + '</div>';

  // Requirement: never render the Website row at all if there's no
  // real website (no fallback substitution, no raw URL).
  var websiteHTML = r.websiteUri
    ? '<a class="rest-action rest-action-secondary" href="' + escHtml(r.websiteUri) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
      +   '<span class="rest-action-label">' + escHtml(restaurantSiteLabel(r.websiteUri)) + '</span>'
      +   '<span class="rest-action-ico" aria-hidden="true">↗</span>'
      + '</a>'
    : '';

  return '<div class="rest-actions">' + directionsHTML + websiteHTML + '</div>';
}

// ─────────────────────────────────────────────────────────
// RENDER RESTAURANTS
// ─────────────────────────────────────────────────────────
function renderRestaurants() {
  if (activeCategory !== 'restaurants') return;
  var cards   = document.getElementById('cards');
  var list    = document.getElementById('list');
  var sep     = document.querySelector('.sep');
  var lbl     = document.getElementById('listLabel');
  var countEl = document.getElementById('catCount');
  var dc      = document.getElementById('dc');

  if (!restaurantResults.length) {
    setMsg('No nearby restaurants found.');
    if (countEl) countEl.textContent = 'No restaurants found nearby';
    if (dc) dc.textContent = '0';
    if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">No nearby restaurants found</div></div>';
    if (list) list.innerHTML = '';
    return;
  }

  var restaurants = restaurantResults.map(function(r) {
    var lat = (r.latitude  != null) ? Number(r.latitude)  : NaN;
    var lon = (r.longitude != null) ? Number(r.longitude) : NaN;
    var dist = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? haversine(userLat, userLon, lat, lon) : null;
    var dir  = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? bearing(userLat, userLon, lat, lon) : '';
    return Object.assign({}, r, { dist: dist, dir: dir });
  });
  restaurants.sort(function(a, b) { return (a.dist == null ? Infinity : a.dist) - (b.dist == null ? Infinity : b.dist); });
  restaurantResults = restaurants;

  if (dc) {
    var nearby = restaurants.filter(function(r) { return r.dist != null && r.dist < 5; }).length;
    dc.textContent = nearby;
  }
  setMsg(restaurants.length + ' restaurants · sorted by distance');
  if (countEl) countEl.textContent = restaurants.length + ' nearby restaurants';
  if (cards) cards.style.display = '';
  if (sep) sep.style.display = '';
  if (lbl) { lbl.style.display = ''; lbl.textContent = 'More Nearby Restaurants'; }
  if (list) list.style.display = '';

  renderRestaurantCards();
  renderRestaurantList();
}

function renderRestaurantMessage(message) {
  var cards = document.getElementById('cards');
  var list  = document.getElementById('list');
  if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">' + escHtml(message) + '</div></div>';
  if (list) list.innerHTML = '';
}

function restaurantPrice(level) {
  var map = { PRICE_LEVEL_FREE: 'Free', PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$',
              PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };
  return map[level] || '';
}

function restaurantRating(r) {
  if (r.rating == null) return '';
  var count = Number(r.reviewCount || 0);
  return '★ ' + Number(r.rating).toFixed(1) + (count ? ' · ' + count.toLocaleString() + ' reviews' : '');
}

// Restaurant hero cards use the same 7-slot layout as landmarks, so
// "Restaurants" visually matches every other category.
function renderRestaurantCards() {
  var cards = document.getElementById('cards');
  if (!cards) return;
  var html = '';
  for (var i = 0; i < HERO_COUNT; i++) {
    var r = restaurantResults[i];
    if (!r) {
      html += '<div class="card"><div class="card-placeholder">No additional restaurant</div></div>';
      continue;
    }
    var dist  = r.dist != null ? r.dist.toFixed(1) : '—';
    var photoUrl = r.photoRef
      ? 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(r.photoRef) + '&maxWidth=300'
      : '';
    var thumbHTML = photoUrl
      ? '<img class="rest-thumb" loading="lazy" src="' + photoUrl + '" alt="' + escHtml(r.name) + '" '
        + 'onerror="this.outerHTML=\'<div class=&quot;rest-thumb-emoji&quot;>\uD83C\uDF74</div>\'">'
      : '<div class="rest-thumb-emoji">🍴</div>';
    html += '<div class="card rank-' + (i + 1) + '" onclick="openRestaurant(' + i + ')">'
          +   '<div class="rest-top">'
          +     thumbHTML
          +     '<div class="card-meta">'
          +       '<div class="card-rank">' + (ORDINAL_LABEL[i] || ('▲ #' + (i + 1))) + '</div>'
          +       '<div class="card-name">' + escHtml(r.name) + '</div>'
          +       '<div class="card-county">' + escHtml(r.address || '') + '</div>'
          +     '</div>'
          +     '<div class="card-dist-wrap">'
          +       '<div class="card-dist">' + dist + '</div>'
          +       '<span class="card-unit">MILES</span>'
          +       '<div class="card-dir">' + escHtml(r.dir || '') + '</div>'
          +     '</div>'
          +   '</div>'
          +   '<div class="card-body">'
          +     '<div class="divider"></div>'
          +     '<div class="card-fact">'
          +       restaurantSnapshotHTML(r)
          +       restaurantActionsHTML(r)
          +     '</div>'
          +   '</div>'
          + '</div>';
  }
  cards.innerHTML = html;
}

function renderRestaurantList() {
  var list = document.getElementById('list');
  if (!list) return;
  var items = restaurantResults.slice(HERO_COUNT, HERO_COUNT + 21);
  if (!items.length) {
    list.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:8px 0">No additional restaurants</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var r = items[i];
    var idx = i + HERO_COUNT;
    var distLabel = r.dist != null ? r.dist.toFixed(1) : '—';
    var dirStr = r.dir || '';
    var photoUrl = r.photoRef
      ? 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(r.photoRef) + '&maxWidth=300'
      : '';
    var thumbHTML = photoUrl
      ? '<img class="rest-thumb" loading="lazy" src="' + photoUrl + '" alt="' + escHtml(r.name) + '" '
        + 'onerror="this.outerHTML=\'<div class=&quot;rest-thumb-emoji&quot;>\uD83C\uDF74</div>\'">'
      : '<div class="rest-thumb-emoji">🍴</div>';
    html += '<div class="card card-mid" onclick="openRestaurant(' + idx + ')">'
          +   '<div class="rest-top">'
          +     thumbHTML
          +     '<div class="card-meta">'
          +       '<div class="card-rank">▲ #' + (idx + 1) + ' NEAREST</div>'
          +       '<div class="card-name">' + escHtml(r.name) + '</div>'
          +       '<div class="card-county">' + escHtml(r.address || '') + '</div>'
          +     '</div>'
          +       '<div class="card-dist-wrap">'
          +         '<div class="card-dist">' + distLabel + '</div>'
          +         '<span class="card-unit">MILES</span>'
          +         '<div class="card-dir">' + dirStr + '</div>'
          +       '</div>'
          +     '</div>'
          +   '<div class="card-body">'
          +     '<div class="divider"></div>'
          +     '<div class="card-fact">'
          +       restaurantSnapshotHTML(r)
          +       restaurantActionsHTML(r)
          +     '</div>'
          +   '</div>'
          + '</div>';
  }
  list.innerHTML = html;
}

// ─────────────────────────────────────────────────────────
// OPEN RESTAURANT
// ─────────────────────────────────────────────────────────
function openRestaurant(index) {
  var r = restaurantResults[index];
  if (!r) return;
  if (r.googleMapsUri) { window.open(r.googleMapsUri, '_blank'); return; }
  if (r.websiteUri)    { window.open(r.websiteUri, '_blank'); return; }
}

// ─────────────────────────────────────────────────────────
// COFFEE SHOPS & BAR/FOOD (worldwide, Google Places-powered)
// Two brand-new categories sharing one parameterized implementation.
// Deliberately does NOT call or modify any restaurant-specific
// function — only reuses the same .rest-* CSS classes already
// proven for restaurants/world landmarks, so no new CSS is needed.
// ─────────────────────────────────────────────────────────
var PLACE_CATEGORIES = {
  coffee: { label: 'Coffee Shops', icon: '☕', results: [], loaded: false, loading: false },
  bar:    { label: 'Bar/Food',     icon: '🍺', results: [], loaded: false, loading: false }
};

function loadPlacesCategory(cat) {
  var state = PLACE_CATEGORIES[cat];
  if (!state || state.loading) return;

  if (userLat === null || userLon === null) {
    setMsg('Waiting for your GPS location…');
    var waitTimer = setInterval(function() {
      if (userLat !== null && userLon !== null) {
        clearInterval(waitTimer);
        loadPlacesCategory(cat);
      }
    }, 500);
    return;
  }

  state.loading = true;
  state.loaded  = false;
  setMsg('Searching for nearby ' + state.label.toLowerCase() + '…');

  var url = 'https://roadguide-lime.vercel.app/api/places?type=' + encodeURIComponent(cat)
          + '&lat=' + encodeURIComponent(userLat) + '&lng=' + encodeURIComponent(userLon) + '&radius=5000'
          + preferencesQueryString();

  fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      state.loading = false;
      state.loaded  = true;
      state.results = Array.isArray(data.places) ? data.places : [];
      renderPlacesCategory(cat);
    })
    .catch(function(error) {
      state.loading = false;
      state.loaded  = false;
      console.error(state.label + ' loading error:', error);
      state.results = [];
      setMsg('Could not load ' + state.label.toLowerCase() + ' — ' + error.message);
      renderPlacesMessage('Could not load nearby ' + state.label.toLowerCase() + '. Please try again.');
    });
}

function renderPlacesMessage(message) {
  var cards = document.getElementById('cards');
  var list  = document.getElementById('list');
  if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">' + escHtml(message) + '</div></div>';
  if (list) list.innerHTML = '';
}

function placeTypeLabel(p) {
  var types = Array.isArray(p.types) ? p.types : [];
  var skip = { point_of_interest: true, establishment: true, food: true };
  for (var i = 0; i < types.length; i++) {
    if (!skip[types[i]]) {
      return types[i].replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    }
  }
  return '';
}

function placeHoursText(p) {
  if (p.openNow === true) {
    var closeTime = restaurantHoursTimeFmt(p.nextCloseTime);
    return closeTime ? 'Open now · Closes ' + closeTime : 'Open now';
  }
  if (p.openNow === false) {
    var openTime = restaurantHoursTimeFmt(p.nextOpenTime);
    return openTime ? 'Closed now · Opens ' + openTime : 'Closed now';
  }
  return 'Hours unknown';
}

// Small local time formatter (kept separate from restaurant code on
// purpose, even though the logic is the same shape).
function restaurantHoursTimeFmt(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function placeRatingText(p) {
  var parts = [];
  if (p.rating != null) {
    var count = Number(p.reviewCount || 0);
    parts.push('★ ' + Number(p.rating).toFixed(1) + (count ? ' (' + count.toLocaleString() + ' reviews)' : ''));
  }
  var priceMap = { PRICE_LEVEL_FREE: 'Free', PRICE_LEVEL_INEXPENSIVE: '$', PRICE_LEVEL_MODERATE: '$$', PRICE_LEVEL_EXPENSIVE: '$$$', PRICE_LEVEL_VERY_EXPENSIVE: '$$$$' };
  if (p.priceLevel && priceMap[p.priceLevel]) parts.push(priceMap[p.priceLevel]);
  return parts.length ? parts.join(' · ') : 'No rating available';
}

function placeSiteLabel(uri) {
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch (e) {
    return uri;
  }
}

function placeSnapshotHTML(p) {
  var isOpen   = p.openNow === true;
  var isClosed = p.openNow === false;
  var hoursClass = isOpen ? 'open' : (isClosed ? 'closed' : '');
  var typeLabel = placeTypeLabel(p);

  var rows = [];
  if (typeLabel) rows.push({ cls: 'cuisine', ico: '📍', val: escHtml(typeLabel) });
  rows.push({ cls: hoursClass, ico: '🕐', val: escHtml(placeHoursText(p)) });
  if (p.outdoorSeating === true)  rows.push({ cls: '', ico: '🌳', val: 'Outdoor seating available' });
  if (p.outdoorSeating === false) rows.push({ cls: '', ico: '🌳', val: 'Outdoor seating not listed' });
  rows.push({ cls: 'rating', ico: '★', val: escHtml(placeRatingText(p)) });

  return '<div class="rest-panel">'
       + rows.map(function(row) {
           return '<div class="rest-row' + (row.cls ? ' ' + row.cls : '') + '">'
                +   '<span class="rest-ico">' + row.ico + '</span>'
                +   '<span class="rest-val">' + row.val + '</span>'
                + '</div>';
         }).join('')
       + '</div>';
}

function placeActionsHTML(p) {
  var lat = (p.latitude  != null) ? Number(p.latitude)  : NaN;
  var lon = (p.longitude != null) ? Number(p.longitude) : NaN;
  var directionsUrl = null;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lon)
        + (p.id ? '&destination_place_id=' + encodeURIComponent(p.id) : '');
  } else if (p.address) {
    directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(p.address);
  }

  var directionsHTML = directionsUrl
    ? '<a class="rest-action rest-action-primary" href="' + escHtml(directionsUrl) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
      +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
      +   '<span class="rest-action-label">Directions</span>'
      + '</a>'
    : '<div class="rest-action rest-action-primary rest-action-disabled">'
      +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
      +   '<span class="rest-action-label">Directions unavailable</span>'
      + '</div>';

  var websiteHTML = p.websiteUri
    ? '<a class="rest-action rest-action-secondary" href="' + escHtml(p.websiteUri) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
      +   '<span class="rest-action-label">' + escHtml(placeSiteLabel(p.websiteUri)) + '</span>'
      +   '<span class="rest-action-ico" aria-hidden="true">↗</span>'
      + '</a>'
    : '';

  return '<div class="rest-actions">' + directionsHTML + websiteHTML + '</div>';
}

function renderPlacesCategory(cat) {
  if (activeCategory !== cat) return;
  var state   = PLACE_CATEGORIES[cat];
  var cards   = document.getElementById('cards');
  var list    = document.getElementById('list');
  var sep     = document.querySelector('.sep');
  var lbl     = document.getElementById('listLabel');
  var countEl = document.getElementById('catCount');
  var dc      = document.getElementById('dc');

  if (!state.results.length) {
    setMsg('No nearby ' + state.label.toLowerCase() + ' found.');
    if (countEl) countEl.textContent = 'No ' + state.label.toLowerCase() + ' found nearby';
    if (dc) dc.textContent = '0';
    if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">No nearby ' + escHtml(state.label.toLowerCase()) + ' found</div></div>';
    if (list) list.innerHTML = '';
    return;
  }

  var places = state.results.map(function(p) {
    var lat = (p.latitude  != null) ? Number(p.latitude)  : NaN;
    var lon = (p.longitude != null) ? Number(p.longitude) : NaN;
    var dist = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? haversine(userLat, userLon, lat, lon) : null;
    var dir  = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? bearing(userLat, userLon, lat, lon) : '';
    return Object.assign({}, p, { dist: dist, dir: dir });
  });
  places.sort(function(a, b) { return (a.dist == null ? Infinity : a.dist) - (b.dist == null ? Infinity : b.dist); });
  state.results = places;

  if (dc) {
    var nearby = places.filter(function(p) { return p.dist != null && p.dist < 5; }).length;
    dc.textContent = nearby;
  }
  setMsg(places.length + ' ' + state.label.toLowerCase() + ' · sorted by distance');
  if (countEl) countEl.textContent = places.length + ' nearby ' + state.label.toLowerCase();
  if (cards) cards.style.display = '';
  if (sep) sep.style.display = '';
  if (lbl) { lbl.style.display = ''; lbl.textContent = 'More Nearby ' + state.label; }
  if (list) list.style.display = '';

  renderPlacesHeroCards(cat);
  renderPlacesListCards(cat);
}

function renderPlacesHeroCards(cat) {
  var state = PLACE_CATEGORIES[cat];
  var cards = document.getElementById('cards');
  if (!cards) return;
  var html = '';
  for (var i = 0; i < HERO_COUNT; i++) {
    var p = state.results[i];
    if (!p) {
      html += '<div class="card"><div class="card-placeholder">No additional ' + escHtml(state.label.toLowerCase()) + '</div></div>';
      continue;
    }
    var dist = p.dist != null ? p.dist.toFixed(1) : '—';
    var photoUrl = p.photoRef
      ? 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(p.photoRef) + '&maxWidth=300'
      : '';
    var thumbHTML = photoUrl
      ? '<img class="rest-thumb" loading="lazy" src="' + photoUrl + '" alt="' + escHtml(p.name) + '" '
        + 'onerror="this.outerHTML=\'<div class=&quot;rest-thumb-emoji&quot;>' + state.icon + '</div>\'">'
      : '<div class="rest-thumb-emoji">' + state.icon + '</div>';

    html += '<div class="card rank-' + (i + 1) + '" onclick="openPlacesResult(\'' + cat + '\',' + i + ')">'
          +   '<div class="rest-top">'
          +     thumbHTML
          +     '<div class="card-meta">'
          +       '<div class="card-rank">' + (ORDINAL_LABEL[i] || ('▲ #' + (i + 1))) + '</div>'
          +       '<div class="card-name">' + escHtml(p.name) + '</div>'
          +       '<div class="card-county">' + escHtml(p.address || '') + '</div>'
          +     '</div>'
          +     '<div class="card-dist-wrap">'
          +       '<div class="card-dist">' + dist + '</div>'
          +       '<span class="card-unit">MILES</span>'
          +       '<div class="card-dir">' + escHtml(p.dir || '') + '</div>'
          +     '</div>'
          +   '</div>'
          +   '<div class="card-body">'
          +     '<div class="divider"></div>'
          +     '<div class="card-fact">'
          +       placeSnapshotHTML(p)
          +       placeActionsHTML(p)
          +     '</div>'
          +   '</div>'
          + '</div>';
  }
  cards.innerHTML = html;
}

function renderPlacesListCards(cat) {
  var state = PLACE_CATEGORIES[cat];
  var list = document.getElementById('list');
  if (!list) return;
  var items = state.results.slice(HERO_COUNT, HERO_COUNT + 21);
  if (!items.length) {
    list.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:8px 0">No additional ' + escHtml(state.label.toLowerCase()) + '</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var p = items[i];
    var idx = i + HERO_COUNT;
    var distLabel = p.dist != null ? p.dist.toFixed(1) : '—';
    var photoUrl = p.photoRef
      ? 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(p.photoRef) + '&maxWidth=300'
      : '';
    var thumbHTML = photoUrl
      ? '<img class="rest-thumb" loading="lazy" src="' + photoUrl + '" alt="' + escHtml(p.name) + '" '
        + 'onerror="this.outerHTML=\'<div class=&quot;rest-thumb-emoji&quot;>' + state.icon + '</div>\'">'
      : '<div class="rest-thumb-emoji">' + state.icon + '</div>';

    html += '<div class="card card-mid" onclick="openPlacesResult(\'' + cat + '\',' + idx + ')">'
          +   '<div class="rest-top">'
          +     thumbHTML
          +     '<div class="card-meta">'
          +       '<div class="card-rank">▲ #' + (idx + 1) + ' NEAREST</div>'
          +       '<div class="card-name">' + escHtml(p.name) + '</div>'
          +       '<div class="card-county">' + escHtml(p.address || '') + '</div>'
          +     '</div>'
          +     '<div class="card-dist-wrap">'
          +       '<div class="card-dist">' + distLabel + '</div>'
          +       '<span class="card-unit">MILES</span>'
          +       '<div class="card-dir">' + escHtml(p.dir || '') + '</div>'
          +     '</div>'
          +   '</div>'
          +   '<div class="card-body">'
          +     '<div class="divider"></div>'
          +     '<div class="card-fact">'
          +       placeSnapshotHTML(p)
          +       placeActionsHTML(p)
          +     '</div>'
          +   '</div>'
          + '</div>';
  }
  list.innerHTML = html;
}

function openPlacesResult(cat, index) {
  var state = PLACE_CATEGORIES[cat];
  var p = state && state.results[index];
  if (!p) return;
  if (p.googleMapsUri) { window.open(p.googleMapsUri, '_blank'); return; }
  if (p.websiteUri)    { window.open(p.websiteUri, '_blank'); return; }
}

// ─────────────────────────────────────────────────────────
// WORLD LANDMARKS (worldwide, Google Places-powered)
// Separate from the curated California ALL_LANDMARKS dataset.
// Reuses the exact same card visuals as the Restaurants tab
// (.rest-thumb / .rest-top / .card-fact / .rest-actions) — no new
// CSS needed anywhere in index.html.
// ─────────────────────────────────────────────────────────
function loadWorldLandmarks() {
  if (worldLandmarksLoading) return;
  if (userLat === null || userLon === null) {
    setMsg('Waiting for your GPS location…');
    var waitTimer = setInterval(function() {
      if (userLat !== null && userLon !== null) {
        clearInterval(waitTimer);
        loadWorldLandmarks();
      }
    }, 500);
    return;
  }
  worldLandmarksLoading = true;
  worldLandmarksLoaded  = false;
  setMsg('Searching for nearby landmarks…');
  var url = 'https://roadguide-lime.vercel.app/api/landmarks?lat=' + encodeURIComponent(userLat)
          + '&lng=' + encodeURIComponent(userLon) + '&radius=20000';
  fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      worldLandmarksLoading = false;
      worldLandmarksLoaded  = true;
      worldLandmarkResults  = Array.isArray(data.landmarks) ? data.landmarks : [];
      renderWorldLandmarks();
    })
    .catch(function(error) {
      // A failed live search should NOT take your curated stories
      // down with it — they don't depend on this fetch at all.
      // Gracefully degrade to curated-only instead of a blank error:
      // mark as "loaded" (with zero live results) so onPos() doesn't
      // hammer a failing endpoint on every GPS tick, then render the
      // blend as normal — it already handles an empty live array
      // correctly, since curated scoring never touches it.
      worldLandmarksLoading = false;
      worldLandmarksLoaded  = true;
      console.error('World landmark loading error:', error);
      worldLandmarkResults = [];
      setMsg('Live search unavailable right now — showing your curated spots.');
      renderWorldLandmarks();
    });
}

function renderWorldLandmarkMessage(message) {
  var cards = document.getElementById('cards');
  var list  = document.getElementById('list');
  if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">' + escHtml(message) + '</div></div>';
  if (list) list.innerHTML = '';
}

// The final blended (curated + live) list, needed for tap-to-open
// and for targeting curated-origin photo lookups after render.
var exploreBlendedResults = [];

function renderWorldLandmarks() {
  // Kept under its old name so loadWorldLandmarks's existing success
  // callback doesn't need touching — but this now blends curated
  // stories with live results into ONE ranked list, not just live
  // results alone. Guard: only proceed if Explore is still actually
  // the active tab, so a late-arriving fetch can't render into
  // whatever tab you've since switched to.
  if (activeCategory !== null) return;
  var cards   = document.getElementById('cards');
  var list    = document.getElementById('list');
  var sep     = document.querySelector('.sep');
  var lbl     = document.getElementById('listLabel');
  var countEl = document.getElementById('catCount');
  var dc      = document.getElementById('dc');

  // Score every curated landmark on the same scale as live results.
  var curatedScored = ALL_LANDMARKS.map(function(lm) {
    var s = scoreCuratedForExplore(lm);
    if (s.tooFar) return null;
    var dir = (userLat !== null && userLon !== null && lm.lat != null && lm.lon != null)
      ? bearing(userLat, userLon, lm.lat, lm.lon) : '';
    return {
      origin: 'curated', name: lm.name, county: lm.county || '', emoji: lm.emoji || '📍',
      lat: lm.lat, lon: lm.lon, fact: lm.fact || '', cat: lm.cat,
      dist: s.dist, dir: dir, bucket: s.bucket, _score: s.score
    };
  }).filter(Boolean);

  // Score live results the same way. bucket/isFun come straight from
  // the backend (it already computed them correctly against Places
  // types); proximity is recomputed fresh here so it reflects your
  // CURRENT position, not wherever you were when the fetch fired.
  var liveScored = worldLandmarkResults.map(function(lm) {
    var lat = (lm.latitude  != null) ? Number(lm.latitude)  : NaN;
    var lon = (lm.longitude != null) ? Number(lm.longitude) : NaN;
    var dist = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? haversine(userLat, userLon, lat, lon) : null;
    var dir  = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? bearing(userLat, userLon, lat, lon) : '';
    var rating = Number(lm.rating || 0);
    var reviewCount = Number(lm.reviewCount || 0);
    var bucket = lm.bucket || 'iconic';
    var typeWeight = EXPLORE_BUCKET_WEIGHTS[bucket] || 24;
    var qualityBonus = Math.max(0, rating - 3.5) * 3;
    var reviewBonus = Math.log10(reviewCount + 1) * 0.8;
    var openNowBonus = lm.openNow === true ? 2 : 0;
    var proximityBonus = dist != null ? Math.max(0, 4 - dist * 0.2) : 0;
    var funBonus = lm.isFun ? 4 : 0;
    var score = typeWeight + qualityBonus + reviewBonus + openNowBonus + proximityBonus + funBonus;
    return Object.assign({}, lm, { origin: 'live', dist: dist, dir: dir, bucket: bucket, _score: score });
  });

  var allScored = curatedScored.concat(liveScored);

  if (!allScored.length) {
    setMsg('No nearby places found.');
    if (countEl) countEl.textContent = 'No places found nearby';
    if (dc) dc.textContent = '0';
    if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">No nearby places found</div></div>';
    if (list) list.innerHTML = '';
    return;
  }

  // Same diversity-aware round-robin as the backend uses for live-only
  // results — sort each bucket by score, then take 1 from each bucket
  // per round, so curated and live entries compete fairly within each
  // category instead of one origin or one bucket dominating.
  var byBucket = {};
  allScored.forEach(function(item) {
    var key = item.bucket || 'iconic';
    if (!byBucket[key]) byBucket[key] = [];
    byBucket[key].push(item);
  });
  Object.keys(byBucket).forEach(function(key) {
    byBucket[key].sort(function(a, b) { return b._score - a._score; });
  });
  var bucketKeys = Object.keys(byBucket);
  var selected = [];
  var round = 0;
  while (selected.length < 28 && bucketKeys.some(function(k) { return byBucket[k][round]; })) {
    for (var bi = 0; bi < bucketKeys.length; bi++) {
      if (selected.length >= 28) break;
      var item = byBucket[bucketKeys[bi]][round];
      if (item) selected.push(item);
    }
    round++;
  }

  // The diversity/significance selection above decides WHICH places
  // make the cut. Display order is a separate decision — restaurants,
  // coffee, and bar all show nearest-first, and Explore should too,
  // so it visually behaves the same way. Without this, card #1 could
  // be a highly significant place 12 miles away while card #2 sits
  // 0.5 miles from you, which reads as "broken" even though selection
  // itself is working correctly.
  selected.sort(function(a, b) { return (a.dist == null ? Infinity : a.dist) - (b.dist == null ? Infinity : b.dist); });

  exploreBlendedResults = selected;

  var curatedCount = selected.filter(function(i) { return i.origin === 'curated'; }).length;
  var liveCount = selected.length - curatedCount;

  if (dc) {
    var nearby = selected.filter(function(i) { return i.dist != null && i.dist < 5; }).length;
    dc.textContent = nearby;
  }
  setMsg(selected.length + ' places · ' + curatedCount + ' curated, ' + liveCount + ' discovered live');
  if (countEl) countEl.textContent = selected.length + ' places to explore';
  if (cards) cards.style.display = '';
  if (sep) sep.style.display = '';
  if (lbl) { lbl.style.display = ''; lbl.textContent = 'More To Explore'; }
  if (list) list.style.display = '';

  renderExploreBlendedCards();
  renderExploreBlendedList();

  // Curated-origin photos still need the async live-lookup — reuse
  // the exact same mechanism already built for curated categories,
  // just with each item's TRUE position in the blended list as its
  // id (curated entries are scattered, not contiguous, so we can't
  // just use their index within a filtered curated-only sub-array).
  var curatedForPhotos = [];
  selected.forEach(function(item, idx) {
    if (item.origin === 'curated') {
      curatedForPhotos.push({ id: idx, name: item.name, county: item.county, lat: item.lat, lon: item.lon });
    }
  });
  loadCuratedPhotos(curatedForPhotos);

}

// Two action rows, reusing the exact restaurant .rest-action classes:
// Directions (primary, gold) always shown; YouTube search (secondary,
// muted) always shown, matching your original curated-landmark cards'
// existing YouTube-link pattern.
function worldLandmarkActionsHTML(lm) {
  var lat = (lm.latitude  != null) ? Number(lm.latitude)  : NaN;
  var lon = (lm.longitude != null) ? Number(lm.longitude) : NaN;
  var directionsUrl = null;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lon)
        + (lm.id ? '&destination_place_id=' + encodeURIComponent(lm.id) : '');
  } else if (lm.address) {
    directionsUrl = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lm.address);
  }

  var directionsHTML = directionsUrl
    ? '<a class="rest-action rest-action-primary" href="' + escHtml(directionsUrl) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
      +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
      +   '<span class="rest-action-label">Directions</span>'
      + '</a>'
    : '<div class="rest-action rest-action-primary rest-action-disabled">'
      +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
      +   '<span class="rest-action-label">Directions unavailable</span>'
      + '</div>';

  var secondaryHTML;
  if (lm.websiteUri) {
    secondaryHTML =
        '<a class="rest-action rest-action-secondary" href="' + escHtml(lm.websiteUri) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
      +   '<span class="rest-action-label">' + escHtml((function() { try { return new URL(lm.websiteUri).hostname.replace(/^www\./, ''); } catch (e) { return lm.websiteUri; } })()) + '</span>'
      +   '<span class="rest-action-ico" aria-hidden="true">↗</span>'
      + '</a>';
  } else {
    var youtubeUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(lm.name);
    secondaryHTML =
        '<a class="rest-action rest-action-secondary" href="' + escHtml(youtubeUrl) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
      +   '<span class="rest-action-label">Watch on YouTube</span>'
      +   '<span class="rest-action-ico" aria-hidden="true">▶</span>'
      + '</a>';
  }

  return '<div class="rest-actions">' + directionsHTML + secondaryHTML + '</div>';
}

function worldLandmarkSnapshotHTML(lm) {
  var rows = [];
  if (lm.openNow === true || lm.openNow === false) {
    var isOpen = lm.openNow === true;
    var hoursText;
    if (isOpen) {
      var closeTime = restaurantHoursTimeFmt(lm.nextCloseTime);
      hoursText = closeTime ? 'Open now · Closes ' + closeTime : 'Open now';
    } else {
      var openTime = restaurantHoursTimeFmt(lm.nextOpenTime);
      hoursText = openTime ? 'Closed now · Opens ' + openTime : 'Closed now';
    }
    rows.push({ cls: isOpen ? 'open' : 'closed', ico: '🕐', val: escHtml(hoursText) });
  }
  if (lm.rating != null) {
    var ratingText = '★ ' + Number(lm.rating).toFixed(1)
      + (lm.reviewCount ? ' (' + Number(lm.reviewCount).toLocaleString() + ' reviews)' : '');
    rows.push({ cls: 'rating', ico: '★', val: escHtml(ratingText) });
  }
  if (!rows.length) return '';
  return '<div class="rest-panel">'
       + rows.map(function(row) {
           return '<div class="rest-row' + (row.cls ? ' ' + row.cls : '') + '">'
                +   '<span class="rest-ico">' + row.ico + '</span>'
                +   '<span class="rest-val">' + row.val + '</span>'
                + '</div>';
         }).join('')
       + '</div>';
}

function renderWorldLandmarkCards() {
  var cards = document.getElementById('cards');
  if (!cards) return;
  var html = '';
  for (var i = 0; i < HERO_COUNT; i++) {
    var lm = worldLandmarkResults[i];
    if (!lm) {
      html += '<div class="card"><div class="card-placeholder">No additional landmarks</div></div>';
      continue;
    }
    var dist = lm.dist != null ? lm.dist.toFixed(1) : '—';
    var photoUrl = lm.photoRef
      ? 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(lm.photoRef) + '&maxWidth=300'
      : '';
    var thumbHTML = photoUrl
      ? '<img class="rest-thumb" loading="lazy" src="' + photoUrl + '" alt="' + escHtml(lm.name) + '" '
        + 'onerror="this.outerHTML=\'<div class=&quot;rest-thumb-emoji&quot;>\uD83D\uDCCD</div>\'">'
      : '<div class="rest-thumb-emoji">📍</div>';
    var factText = lm.funFacts ? escHtml(lm.funFacts) : 'No summary available for this landmark yet.';

    html += '<div class="card rank-' + (i + 1) + '" onclick="openWorldLandmark(' + i + ')">'
          +   '<div class="rest-top">'
          +     thumbHTML
          +     '<div class="card-meta">'
          +       '<div class="card-rank">' + (ORDINAL_LABEL[i] || ('▲ #' + (i + 1))) + '</div>'
          +       '<div class="card-name">' + escHtml(lm.name) + '</div>'
          +       '<div class="card-county">' + escHtml(lm.address || '') + '</div>'
          +     '</div>'
          +     '<div class="card-dist-wrap">'
          +       '<div class="card-dist">' + dist + '</div>'
          +       '<span class="card-unit">MILES</span>'
          +       '<div class="card-dir">' + escHtml(lm.dir || '') + '</div>'
          +     '</div>'
          +   '</div>'
          +   '<div class="card-body">'
          +     '<div class="divider"></div>'
          +     '<div class="card-fact">'
          +       worldLandmarkSnapshotHTML(lm)
          +       factText
          +       worldLandmarkActionsHTML(lm)
          +     '</div>'
          +   '</div>'
          + '</div>';
  }
  cards.innerHTML = html;
}

function renderWorldLandmarkList() {
  var list = document.getElementById('list');
  if (!list) return;
  var items = worldLandmarkResults.slice(HERO_COUNT, HERO_COUNT + 21);
  if (!items.length) {
    list.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:8px 0">No additional landmarks</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var lm = items[i];
    var idx = i + HERO_COUNT;
    var distLabel = lm.dist != null ? lm.dist.toFixed(1) : '—';
    var dirStr = lm.dir || '';
    var photoUrl = lm.photoRef
      ? 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(lm.photoRef) + '&maxWidth=300'
      : '';
    var thumbHTML = photoUrl
      ? '<img class="rest-thumb" loading="lazy" src="' + photoUrl + '" alt="' + escHtml(lm.name) + '" '
        + 'onerror="this.outerHTML=\'<div class=&quot;rest-thumb-emoji&quot;>\uD83D\uDCCD</div>\'">'
      : '<div class="rest-thumb-emoji">📍</div>';
    var factText = lm.funFacts ? escHtml(lm.funFacts) : 'No summary available for this landmark yet.';

    html += '<div class="card card-mid" onclick="openWorldLandmark(' + idx + ')">'
          +   '<div class="rest-top">'
          +     thumbHTML
          +     '<div class="card-meta">'
          +       '<div class="card-rank">▲ #' + (idx + 1) + ' NEAREST</div>'
          +       '<div class="card-name">' + escHtml(lm.name) + '</div>'
          +       '<div class="card-county">' + escHtml(lm.address || '') + '</div>'
          +     '</div>'
          +     '<div class="card-dist-wrap">'
          +       '<div class="card-dist">' + distLabel + '</div>'
          +       '<span class="card-unit">MILES</span>'
          +       '<div class="card-dir">' + escHtml(dirStr) + '</div>'
          +     '</div>'
          +   '</div>'
          +   '<div class="card-body">'
          +     '<div class="divider"></div>'
          +     '<div class="card-fact">'
          +       worldLandmarkSnapshotHTML(lm)
          +       factText
          +       worldLandmarkActionsHTML(lm)
          +     '</div>'
          +   '</div>'
          + '</div>';
  }
  list.innerHTML = html;
}

// Builds one card's HTML for the blended Explore list. isHero
// controls rank-label style and card class; the actual content
// branches on item.origin, since curated and live items carry
// different fields (hand-written fact vs Wikipedia funFacts, no
// website/hours for curated vs both for live, etc).
function exploreBlendedCardHTML(item, index, isHero, openHandlerName) {
  openHandlerName = openHandlerName || 'openExploreBlendedItem';
  var isCurated = item.origin === 'curated';
  var dist = item.dist != null ? item.dist.toFixed(1) : '—';
  var subtitle = isCurated ? (item.county || '') : (item.address || '');

  var thumbHTML;
  if (isCurated) {
    thumbHTML = '<div class="card-emoji" id="curatedPhotoSlot' + index + '" style="display:flex">' + escHtml(item.emoji || '📍') + '</div>';
  } else {
    var photoUrl = item.photoRef
      ? 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(item.photoRef) + '&maxWidth=300'
      : '';
    thumbHTML = photoUrl
      ? '<img class="rest-thumb" loading="lazy" src="' + photoUrl + '" alt="' + escHtml(item.name) + '" '
        + 'onerror="this.outerHTML=\'<div class=&quot;rest-thumb-emoji&quot;>\uD83D\uDCCD</div>\'">'
      : '<div class="rest-thumb-emoji">📍</div>';
  }

  var snapshotHTML = isCurated ? '' : worldLandmarkSnapshotHTML(item);
  var factText = isCurated ? (item.fact || '') : (item.funFacts ? escHtml(item.funFacts) : 'No summary available for this landmark yet.');

  var actionsHTML;
  if (isCurated) {
    var directionsUrl = (item.lat != null && item.lon != null)
      ? 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(item.lat + ',' + item.lon)
      : null;
    var directionsHTML = directionsUrl
      ? '<a class="rest-action rest-action-primary" href="' + escHtml(directionsUrl) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
        +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
        +   '<span class="rest-action-label">Directions</span>'
        + '</a>'
      : '<div class="rest-action rest-action-primary rest-action-disabled">'
        +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
        +   '<span class="rest-action-label">Directions unavailable</span>'
        + '</div>';
    var youtubeUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(item.name);
    var youtubeHTML =
        '<a class="rest-action rest-action-secondary" href="' + escHtml(youtubeUrl) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
      +   '<span class="rest-action-label">Watch on YouTube</span>'
      +   '<span class="rest-action-ico" aria-hidden="true">▶</span>'
      + '</a>';
    actionsHTML = '<div class="rest-actions">' + directionsHTML + youtubeHTML + '</div>';
  } else {
    actionsHTML = worldLandmarkActionsHTML(item);
  }

  var rankLabel = isHero ? (ORDINAL_LABEL[index] || ('▲ #' + (index + 1))) : ('▲ #' + (index + 1) + ' NEAREST');
  var cardClass = isHero ? ('card rank-' + (index + 1)) : 'card card-mid';

  return '<div class="' + cardClass + '" onclick="' + openHandlerName + '(' + index + ')">'
       +   '<div class="rest-top">'
       +     thumbHTML
       +     '<div class="card-meta">'
       +       '<div class="card-rank">' + rankLabel + '</div>'
       +       '<div class="card-name">' + escHtml(item.name) + '</div>'
       +       '<div class="card-county">' + escHtml(subtitle) + '</div>'
       +     '</div>'
       +     '<div class="card-dist-wrap">'
       +       '<div class="card-dist">' + dist + '</div>'
       +       '<span class="card-unit">MILES</span>'
       +       '<div class="card-dir">' + escHtml(item.dir || '') + '</div>'
       +     '</div>'
       +   '</div>'
       +   '<div class="card-body">'
       +     '<div class="divider"></div>'
       +     '<div class="card-fact">'
       +       snapshotHTML
       +       factText
       +       actionsHTML
       +     '</div>'
       +   '</div>'
       + '</div>';
}

function renderExploreBlendedCards() {
  var cards = document.getElementById('cards');
  if (!cards) return;
  var html = '';
  for (var i = 0; i < HERO_COUNT; i++) {
    var item = exploreBlendedResults[i];
    html += item
      ? exploreBlendedCardHTML(item, i, true)
      : '<div class="card"><div class="card-placeholder">No additional places</div></div>';
  }
  cards.innerHTML = html;
}

function renderExploreBlendedList() {
  var list = document.getElementById('list');
  if (!list) return;
  var items = exploreBlendedResults.slice(HERO_COUNT, HERO_COUNT + 21);
  if (!items.length) {
    list.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:8px 0">No additional places</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += exploreBlendedCardHTML(items[i], i + HERO_COUNT, false);
  }
  list.innerHTML = html;
}

function openExploreBlendedItem(index) {
  var item = exploreBlendedResults[index];
  if (!item) return;
  if (item.origin === 'curated') {
    if (item.lat != null && item.lon != null) {
      window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(item.lat + ',' + item.lon), '_blank');
    }
    return;
  }
  if (item.googleMapsUri) { window.open(item.googleMapsUri, '_blank'); return; }
  if (item.websiteUri)    { window.open(item.websiteUri, '_blank'); return; }
}

// Deliberately narrow: only your curated film-location entries. The
// live side covers the full Arts/Pop/Local Cool Stuff breadth per the
// spec, but broadening curated-matching to Historic/Winery/Museum-
// style cat values would just duplicate content those dedicated tabs
// already show.
function isCuratedCoolStuffEntry(lm) {
  return /movie|tv|film/.test((lm.cat || '').toLowerCase());
}


// ─────────────────────────────────────────────────────────
// MUSEUM (worldwide, Google Places-powered, blended with curated
// museum-type entries). Same architecture as Cool Stuff — curated +
// live merged and sorted by distance — but without Cool Stuff's
// Wikipedia-required gate or reduced result count, since this
// category is meant to comprehensively surface museums, not curate
// a small, delight-optimized list.
// ─────────────────────────────────────────────────────────
var museumResults = [];
var museumLoaded = false;
var museumLoading = false;
var museumBlendedResults = [];
var MUSEUM_MAX_MILES = 15;

function isCuratedMuseumEntry(lm) {
  return /^museum$|^science center$|^planetarium$|^aquarium$|^space center$|^zoo$|^observatory$|^history museum$|^art museum$|^children.s museum$/.test((lm.cat || '').toLowerCase());
}

function loadMuseum() {
  if (museumLoading) return;
  if (userLat === null || userLon === null) {
    setMsg('Waiting for your GPS location…');
    var waitTimer = setInterval(function() {
      if (userLat !== null && userLon !== null) {
        clearInterval(waitTimer);
        loadMuseum();
      }
    }, 500);
    return;
  }
  museumLoading = true;
  museumLoaded  = false;
  setMsg('Searching for nearby museums…');
  var url = 'https://roadguide-lime.vercel.app/api/landmarks?category=museum&lat=' + encodeURIComponent(userLat)
          + '&lng=' + encodeURIComponent(userLon) + '&radius=32187';
  fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      museumLoading = false;
      museumLoaded  = true;
      museumResults = Array.isArray(data.landmarks) ? data.landmarks : [];
      renderMuseum();
    })
    .catch(function(error) {
      // Same graceful-degrade philosophy as Cool Stuff: a failed live
      // fetch shouldn't take your curated museum entries down with it.
      museumLoading = false;
      museumLoaded  = true;
      console.error('Museum loading error:', error);
      museumResults = [];
      setMsg('Live search unavailable right now — showing your curated spots.');
      renderMuseum();
    });
}

function renderMuseum() {
  if (activeCategory !== 'museum') return;
  var cards   = document.getElementById('cards');
  var list    = document.getElementById('list');
  var sep     = document.querySelector('.sep');
  var lbl     = document.getElementById('listLabel');
  var countEl = document.getElementById('catCount');
  var dc      = document.getElementById('dc');

  var curatedMuseum = ALL_LANDMARKS.filter(isCuratedMuseumEntry).map(function(lm) {
    var dist = (userLat !== null && userLon !== null && lm.lat != null && lm.lon != null)
      ? haversine(userLat, userLon, lm.lat, lm.lon) : null;
    if (dist != null && dist > MUSEUM_MAX_MILES) return null;
    var dir = (userLat !== null && userLon !== null && lm.lat != null && lm.lon != null)
      ? bearing(userLat, userLon, lm.lat, lm.lon) : '';
    return {
      origin: 'curated', name: lm.name, county: lm.county || '', emoji: lm.emoji || '🔭',
      lat: lm.lat, lon: lm.lon, fact: lm.fact || '', cat: lm.cat, dist: dist, dir: dir
    };
  }).filter(Boolean);

  var liveMuseum = museumResults.map(function(lm) {
    var lat = (lm.latitude  != null) ? Number(lm.latitude)  : NaN;
    var lon = (lm.longitude != null) ? Number(lm.longitude) : NaN;
    var dist = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? haversine(userLat, userLon, lat, lon) : null;
    var dir  = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? bearing(userLat, userLon, lat, lon) : '';
    return Object.assign({}, lm, { origin: 'live', dist: dist, dir: dir });
  }).filter(function(item) {
    return item.dist == null || item.dist <= MUSEUM_MAX_MILES;
  });

  var combined = curatedMuseum.concat(liveMuseum);
  combined.sort(function(a, b) { return (a.dist == null ? Infinity : a.dist) - (b.dist == null ? Infinity : b.dist); });
  combined = combined.slice(0, 28);

  museumBlendedResults = combined;

  if (!combined.length) {
    setMsg('No museums found within 15 miles right now.');
    if (countEl) countEl.textContent = 'No museums found nearby';
    if (dc) dc.textContent = '0';
    if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">No nearby museums found</div></div>';
    if (list) list.innerHTML = '';
    return;
  }

  var curatedCount = combined.filter(function(i) { return i.origin === 'curated'; }).length;
  var liveCount = combined.length - curatedCount;

  if (dc) {
    var nearby = combined.filter(function(i) { return i.dist != null && i.dist < 5; }).length;
    dc.textContent = nearby;
  }
  setMsg(combined.length + ' museums · ' + curatedCount + ' curated, ' + liveCount + ' discovered live');
  if (countEl) countEl.textContent = combined.length + ' nearby museums';
  if (cards) cards.style.display = '';
  if (sep) sep.style.display = '';
  if (lbl) { lbl.style.display = ''; lbl.textContent = 'More Nearby Museums'; }
  if (list) list.style.display = '';

  renderMuseumCards();
  renderMuseumList();

  var curatedForPhotos = [];
  combined.forEach(function(item, idx) {
    if (item.origin === 'curated') {
      curatedForPhotos.push({ id: idx, name: item.name, county: item.county, lat: item.lat, lon: item.lon });
    }
  });
  loadCuratedPhotos(curatedForPhotos);
}

function renderMuseumCards() {
  var cards = document.getElementById('cards');
  if (!cards) return;
  var html = '';
  for (var i = 0; i < HERO_COUNT; i++) {
    var item = museumBlendedResults[i];
    html += item
      ? exploreBlendedCardHTML(item, i, true, 'openMuseumItem')
      : '<div class="card"><div class="card-placeholder">No additional museums</div></div>';
  }
  cards.innerHTML = html;
}

function renderMuseumList() {
  var list = document.getElementById('list');
  if (!list) return;
  var items = museumBlendedResults.slice(HERO_COUNT, HERO_COUNT + 21);
  if (!items.length) {
    list.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:8px 0">No additional museums</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += exploreBlendedCardHTML(items[i], i + HERO_COUNT, false, 'openMuseumItem');
  }
  list.innerHTML = html;
}

function openMuseumItem(index) {
  var item = museumBlendedResults[index];
  if (!item) return;
  if (item.origin === 'curated') {
    if (item.lat != null && item.lon != null) {
      window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(item.lat + ',' + item.lon), '_blank');
    }
    return;
  }
  if (item.googleMapsUri) { window.open(item.googleMapsUri, '_blank'); return; }
  if (item.websiteUri)    { window.open(item.websiteUri, '_blank'); return; }
}

// ─────────────────────────────────────────────────────────
// HOOK ME UP — mood-based picker. Instead of browsing a full
// category, pick a mood and get 3-5 recommendations. Self-contained
// (doesn't reuse loadMuseum/loadCoolStuff's own tab-bound functions,
// since those guard on activeCategory values that no longer exist as
// selectable tabs) but DOES reuse their standalone curated-matcher
// functions and the same live-search backend.
//
// Honest design note: "Surprise me", "Something weird", and
// "Something cool to see" all draw from the exact same Cool Stuff
// pool (Places has no way to actually distinguish these vibes) — a
// fresh random sample each time, not three fake-different sources.
// ─────────────────────────────────────────────────────────
var hookMeUpResults = [];
var HOOKMEUP_MAX_MILES = 20;

// Moods with their own dedicated, live-only type category (no
// curated blending — these are brand-new, single-purpose moods).
var HOOKMEUP_LIVE_CATEGORY = {
  beautiful:   'nature',
  artsy:       'artsy'
};

function hookMeUpRandomSample(arr, min, max) {
  var copy = arr.slice();
  for (var i = copy.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
  }
  var count = Math.min(copy.length, min + Math.floor(Math.random() * (max - min + 1)));
  return copy.slice(0, count);
}

function onHookMeUpMoodChange() {
  var sel = document.getElementById('hookMeUpSelect');
  if (!sel || !sel.value) return;
  roadtipStorageSet('roadtip_hiddenGemsMood', sel.value);
  loadHookMeUpMood(sel.value);
  // Return to the default screen once a mood is chosen — the picker
  // reappears automatically if the user taps the Hidden Gems tab
  // again (setCat resets it), so nothing is permanently lost.
  var picker = document.getElementById('hookMeUpPicker');
  if (picker) picker.style.display = 'none';
}

function hookMeUpShowLoading(message) {
  var cards = document.getElementById('cards');
  var list  = document.getElementById('list');
  var sep   = document.querySelector('.sep');
  var lbl   = document.getElementById('listLabel');
  if (list) list.style.display = 'none';
  if (sep)  sep.style.display  = 'none';
  if (lbl)  lbl.style.display  = 'none';
  if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">' + escHtml(message) + '</div></div>';
  setMsg(message);
}

function loadHookMeUpMood(mood) {
  if (activeCategory !== 'hookmeup') return;
  if (userLat === null || userLon === null) {
    hookMeUpShowLoading('Waiting for your GPS location…');
    var waitTimer = setInterval(function() {
      if (userLat !== null && userLon !== null) {
        clearInterval(waitTimer);
        loadHookMeUpMood(mood);
      }
    }, 500);
    return;
  }

  hookMeUpShowLoading('Finding something for you…');

  if (mood === 'museums') {
    hookMeUpFetchBlended('museum', isCuratedMuseumEntry, '🔭', {
      queries: 'science museum,natural history museum,maritime museum,transportation museum,specialty museum'
    });
  } else if (mood === 'weird') {
    hookMeUpFetchBlended('coolstuff', isCuratedCoolStuffEntry, '😎', {
      queries: 'quirky attraction,unusual attraction,strange attraction,roadside attraction,unusual museum,unusual collection,historic oddity,quirky local attraction,hidden gem'
    });
  } else if (mood === 'seeit') {
    hookMeUpFetchSurpriseMe();
  } else if (mood === 'beautiful') {
    hookMeUpFetchLiveOnly('nature', {
      queries: 'scenic overlook,waterfall,coastal viewpoint,arboretum,lookout point'
    });
  } else if (mood === 'artsy') {
    hookMeUpFetchLiveOnly('artsy', {
      queries: 'mural,street art,public art,art installation,sculpture installation,art district,creative space,artist studio,unusual gallery,design landmark,architecture landmark',
      allowSculpture: true
    });
  } else if (mood === 'farmersmarket') {
    hookMeUpFetchTextSearch('farmers market', 10, '🥕');
  } else if (mood === 'streetfair') {
    hookMeUpFetchTextSearch('street fair', 10, '🎪');
  } else if (mood === 'festivals') {
    hookMeUpFetchTextSearch(
      'festival,street festival,community festival,neighborhood festival,art fair,craft fair,food festival,block party,art and wine festival,free music',
      10, '🎉');
  } else if (mood === 'foodtruck') {
    hookMeUpFetchTextSearch('food truck night,food truck event,food truck rally,food trucks', 10, '🚚');
  } else if (mood === 'music') {
    hookMeUpFetchMusicAndComedy();
  } else {
    var cat = HOOKMEUP_LIVE_CATEGORY[mood];
    if (!cat) return;
    hookMeUpFetchLiveOnly(cat);
  }
}

// Shared live-search call, used by every mood.
function hookMeUpFetchCategory(categoryParam) {
  var url = 'https://roadguide-lime.vercel.app/api/landmarks?category=' + encodeURIComponent(categoryParam)
          + '&lat=' + encodeURIComponent(userLat) + '&lng=' + encodeURIComponent(userLon) + '&radius=32187';
  return fetch(url).then(function(response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(function(data) {
    return Array.isArray(data.landmarks) ? data.landmarks : [];
  });
}

// For moods with curated blending (museums, surprise/weird/seeit).
// Fetches a text-search pool WITHOUT rendering — used to merge into
// the Nearby-Search pools below. mode="general" (the lighter bar) is
// always used here; the strict mode remains exclusively for the
// existing event-style moods (Farmers Markets, Food Trucks, etc).
function hookMeUpFetchTextSearchPool(queryString, radiusMiles, allowSculpture) {
  var radiusMeters = Math.round(radiusMiles * 1609.34);
  var url = 'https://roadguide-lime.vercel.app/api/textsearch?lat=' + encodeURIComponent(userLat)
          + '&lng=' + encodeURIComponent(userLon) + '&radius=' + radiusMeters
          + '&queries=' + encodeURIComponent(queryString) + '&mode=general'
          + (allowSculpture ? '&allowSculpture=1' : '');
  return fetch(url)
    .then(function(response) { return response.ok ? response.json() : { places: [] }; })
    .then(function(data) { return Array.isArray(data.places) ? data.places : []; })
    .catch(function() { return []; });
}

// Builds the curated+live pool for a blended category WITHOUT
// rendering — reused by both the direct mood (Museums/Quirky) and by
// Surprise Me, which needs the raw pool to mix across categories.
// textQuerySupplement (optional) merges in a Text Search discovery
// pool for subtypes with no clean Places type (e.g. "science museum",
// "roadside attraction") — deduped against the Nearby Search results.
function hookMeUpBuildBlendedPool(categoryParam, curatedMatcher, fallbackEmoji, textQuerySupplement) {
  var curated = ALL_LANDMARKS.filter(curatedMatcher).map(function(lm) {
    var dist = (lm.lat != null && lm.lon != null) ? haversine(userLat, userLon, lm.lat, lm.lon) : null;
    if (dist != null && dist > HOOKMEUP_MAX_MILES) return null;
    var dir = (lm.lat != null && lm.lon != null) ? bearing(userLat, userLon, lm.lat, lm.lon) : '';
    return {
      origin: 'curated', name: lm.name, county: lm.county || '', emoji: lm.emoji || fallbackEmoji,
      lat: lm.lat, lon: lm.lon, fact: lm.fact || '', dist: dist, dir: dir
    };
  }).filter(Boolean);

  var nearbySearchPromise = hookMeUpFetchCategory(categoryParam);
  var textSearchPromise = textQuerySupplement
    ? hookMeUpFetchTextSearchPool(textQuerySupplement.queries, HOOKMEUP_MAX_MILES, textQuerySupplement.allowSculpture)
    : Promise.resolve([]);

  return Promise.all([nearbySearchPromise, textSearchPromise]).then(function(results) {
    var liveResults = results[0];
    var textResults = results[1];

    var seen = {};
    var live = [];
    liveResults.concat(textResults).forEach(function(lm) {
      var key = lm.id || lm.name;
      if (seen[key]) return;
      seen[key] = true;
      var lat = (lm.latitude  != null) ? Number(lm.latitude)  : NaN;
      var lon = (lm.longitude != null) ? Number(lm.longitude) : NaN;
      var dist = Number.isFinite(lat) && Number.isFinite(lon) ? haversine(userLat, userLon, lat, lon) : null;
      var dir  = Number.isFinite(lat) && Number.isFinite(lon) ? bearing(userLat, userLon, lat, lon) : '';
      if (dist != null && dist > HOOKMEUP_MAX_MILES) return;
      live.push(Object.assign({}, lm, { origin: 'live', dist: dist, dir: dir }));
    });

    return curated.concat(live);
  }).catch(function(error) {
    console.error('Hook Me Up loading error:', error);
    // Graceful degrade: curated results (if any) don't depend on the
    // failed fetch, so still return those rather than nothing.
    return curated;
  });
}

function hookMeUpFetchBlended(categoryParam, curatedMatcher, fallbackEmoji, textQuerySupplement) {
  hookMeUpBuildBlendedPool(categoryParam, curatedMatcher, fallbackEmoji, textQuerySupplement).then(function(pool) {
    if (!pool.length) {
      hookMeUpShowLoading('Nothing found right now — try again in a moment.');
      return;
    }
    hookMeUpRenderResults(pool);
  });
}

// For brand-new, live-only moods (beautiful, interesting, family,
// artsy, music, comedy) — no curated blending.
function hookMeUpBuildLiveOnlyPool(categoryParam, textQuerySupplement) {
  var nearbySearchPromise = hookMeUpFetchCategory(categoryParam);
  var textSearchPromise = textQuerySupplement
    ? hookMeUpFetchTextSearchPool(textQuerySupplement.queries, HOOKMEUP_MAX_MILES, textQuerySupplement.allowSculpture)
    : Promise.resolve([]);

  return Promise.all([nearbySearchPromise, textSearchPromise]).then(function(results) {
    var liveResults = results[0];
    var textResults = results[1];

    var seen = {};
    var live = [];
    liveResults.concat(textResults).forEach(function(lm) {
      var key = lm.id || lm.name;
      if (seen[key]) return;
      seen[key] = true;
      var lat = (lm.latitude  != null) ? Number(lm.latitude)  : NaN;
      var lon = (lm.longitude != null) ? Number(lm.longitude) : NaN;
      var dist = Number.isFinite(lat) && Number.isFinite(lon) ? haversine(userLat, userLon, lat, lon) : null;
      var dir  = Number.isFinite(lat) && Number.isFinite(lon) ? bearing(userLat, userLon, lat, lon) : '';
      if (dist != null && dist > HOOKMEUP_MAX_MILES) return;
      live.push(Object.assign({}, lm, { origin: 'live', dist: dist, dir: dir }));
    });
    return live;
  }).catch(function(error) {
    console.error('Hook Me Up loading error:', error);
    return [];
  });
}

function hookMeUpFetchLiveOnly(categoryParam, textQuerySupplement) {
  hookMeUpBuildLiveOnlyPool(categoryParam, textQuerySupplement).then(function(live) {
    if (!live.length) {
      hookMeUpShowLoading('Nothing found right now — try again in a moment.');
      return;
    }
    hookMeUpRenderResults(live);
  });
}

// "Occasional Music & Comedy" merges two existing backend categories
// (music venues + comedy clubs) into one mood, since both are about
// the same kind of periodic, worth-discovering local experience.
// Deliberately requires a real website ONLY — no "currently open"
// requirement, since this is explicitly about things that happen
// periodically, not this exact moment. A Google Maps link or social
// page is never substituted here; websiteUri is Google's own field
// with no fallback, verified directly in api/landmarks.js.
function hookMeUpFetchMusicAndComedy() {
  Promise.all([
    hookMeUpFetchCategory('music'),
    hookMeUpFetchCategory('comedy')
  ]).then(function(results) {
    var seen = {};
    var merged = [];
    results.forEach(function(list) {
      list.forEach(function(lm) {
        var key = lm.id || lm.name;
        if (seen[key]) return;
        seen[key] = true;
        merged.push(lm);
      });
    });

    var live = merged.map(function(lm) {
      var lat = (lm.latitude  != null) ? Number(lm.latitude)  : NaN;
      var lon = (lm.longitude != null) ? Number(lm.longitude) : NaN;
      var dist = Number.isFinite(lat) && Number.isFinite(lon) ? haversine(userLat, userLon, lat, lon) : null;
      var dir  = Number.isFinite(lat) && Number.isFinite(lon) ? bearing(userLat, userLon, lat, lon) : '';
      return Object.assign({}, lm, { origin: 'live', dist: dist, dir: dir });
    })
      .filter(function(item) { return item.dist == null || item.dist <= HOOKMEUP_MAX_MILES; })
      .filter(function(item) { return !!item.websiteUri; });

    hookMeUpRenderResults(live);
  }).catch(function(error) {
    console.error('Hook Me Up music/comedy loading error:', error);
    hookMeUpShowLoading('Nothing found right now — try again in a moment.');
  });
}

// Farmers Markets / Street Fairs / Festivals & Fairs / Food Trucks —
// these are recurring COMMUNITY EVENTS, not permanent places. The
// backend (api/textsearch.js) now does the hard work of verification:
// it only returns results with a real website, real posted weekly
// hours, AND a currently-active status. So unlike before, there's no
// need for a fake caveat here — the real hours snapshot (open now,
// closes at X) and the website action button already tell the honest
// story, because this data is now genuinely verified, not guessed at.
function hookMeUpFetchTextSearch(queryString, radiusMiles, fallbackEmoji) {
  var radiusMeters = Math.round(radiusMiles * 1609.34);
  var url = 'https://roadguide-lime.vercel.app/api/textsearch?lat=' + encodeURIComponent(userLat)
          + '&lng=' + encodeURIComponent(userLon) + '&radius=' + radiusMeters
          + '&queries=' + encodeURIComponent(queryString);

  fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      var results = Array.isArray(data.places) ? data.places : [];
      var live = results.map(function(p) {
        var lat = (p.latitude  != null) ? Number(p.latitude)  : NaN;
        var lon = (p.longitude != null) ? Number(p.longitude) : NaN;
        var dist = Number.isFinite(lat) && Number.isFinite(lon) ? haversine(userLat, userLon, lat, lon) : null;
        var dir  = Number.isFinite(lat) && Number.isFinite(lon) ? bearing(userLat, userLon, lat, lon) : '';
        return Object.assign({}, p, {
          origin: 'live', dist: dist, dir: dir,
          emoji: fallbackEmoji,
          funFacts: '✅ Verified open now — see hours and website below for details.'
        });
      }).filter(function(item) { return item.dist == null || item.dist <= radiusMiles; });
      hookMeUpRenderResults(live);
    })
    .catch(function(error) {
      console.error('Hook Me Up text search error:', error);
      hookMeUpShowLoading('Nothing found right now — try again in a moment.');
    });
}

// "Something to eat" hits the restaurants endpoint directly — a
// different response shape (already compatible with the shared card
// renderer as a "live" origin item), no curated blending (restaurants
// never had curated data to begin with).
function hookMeUpFetchRestaurants() {
  var url = 'https://roadguide-lime.vercel.app/api/restaurants?lat=' + encodeURIComponent(userLat)
          + '&lng=' + encodeURIComponent(userLon) + '&radius=5000&hidden=1';
  fetch(url).then(function(response) {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(function(data) {
    var results = Array.isArray(data.restaurants) ? data.restaurants : [];
    var live = results.map(function(r) {
      var lat = (r.latitude  != null) ? Number(r.latitude)  : NaN;
      var lon = (r.longitude != null) ? Number(r.longitude) : NaN;
      var dist = Number.isFinite(lat) && Number.isFinite(lon) ? haversine(userLat, userLon, lat, lon) : null;
      var dir  = Number.isFinite(lat) && Number.isFinite(lon) ? bearing(userLat, userLon, lat, lon) : '';
      return Object.assign({}, r, { origin: 'live', dist: dist, dir: dir });
    });
    hookMeUpRenderResults(live);
  }).catch(function(error) {
    console.error('Hook Me Up (eat) loading error:', error);
    hookMeUpShowLoading('Nothing found right now — try again in a moment.');
  });
}

function hookMeUpRenderResults(pool) {
  if (activeCategory !== 'hookmeup') return;
  var cards   = document.getElementById('cards');
  var list    = document.getElementById('list');
  var sep     = document.querySelector('.sep');
  var lbl     = document.getElementById('listLabel');
  var countEl = document.getElementById('catCount');
  var dc      = document.getElementById('dc');

  if (list) list.style.display = 'none';
  if (sep)  sep.style.display  = 'none';
  if (lbl)  lbl.style.display  = 'none';

  var picks;
  if (hasAnyActivePreference()) {
    // Preference-ranked selection: sort by preference-adjusted score
    // and take the top 3-5. Curated entries (which have no bucket/
    // isFun classification, since that's Google Places-derived data)
    // get a neutral adjustment of 0 rather than a guess.
    var scored = pool.map(function(item) {
      var rating = Number(item.rating || 0);
      var qualityBonus = Math.max(0, rating - 3.5) * 3;
      var reviewCount = landmarkEffectiveReviewCount(item.reviewCount || 0);
      var reviewBonus = Math.log10(reviewCount + 1) * landmarkReviewWeight();
      var typeWeight = item.bucket ? (EXPLORE_BUCKET_WEIGHTS[item.bucket] || 24) : 24;
      var prefAdj = item.bucket ? landmarkPreferenceAdjustment(item.bucket, item.isFun) : 0;
      return Object.assign({}, item, { _prefScore: typeWeight + qualityBonus + reviewBonus + prefAdj });
    });
    scored.sort(function(a, b) { return b._prefScore - a._prefScore; });
    picks = scored.slice(0, 5).map(function(item) {
      var clean = Object.assign({}, item);
      delete clean._prefScore;
      return clean;
    });
  } else {
    // Exact existing behavior, byte-for-byte, when no preference is set.
    picks = hookMeUpRandomSample(pool, 3, 5);
  }
  hookMeUpResults = picks;

  if (!picks.length) {
    setMsg('Nothing found for that mood within 15 miles.');
    if (countEl) countEl.textContent = 'No results found nearby';
    if (dc) dc.textContent = '0';
    if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">Nothing found for that mood within 15 miles</div></div>';
    return;
  }

  if (dc) dc.textContent = picks.filter(function(p) { return p.dist != null && p.dist < 5; }).length;
  setMsg(picks.length + ' picks for you');
  if (countEl) countEl.textContent = picks.length + ' picks for you';
  if (cards) cards.style.display = '';

  var html = '';
  for (var i = 0; i < picks.length; i++) {
    html += exploreBlendedCardHTML(picks[i], i, true, 'openHookMeUpItem');
  }
  cards.innerHTML = html;

  var curatedForPhotos = [];
  picks.forEach(function(item, idx) {
    if (item.origin === 'curated') {
      curatedForPhotos.push({ id: idx, name: item.name, county: item.county, lat: item.lat, lon: item.lon });
    }
  });
  if (curatedForPhotos.length) loadCuratedPhotos(curatedForPhotos);
}

function openHookMeUpItem(index) {
  var item = hookMeUpResults[index];
  if (!item) return;
  if (item.origin === 'curated') {
    if (item.lat != null && item.lon != null) {
      window.open('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(item.lat + ',' + item.lon), '_blank');
    }
    return;
  }
  if (item.googleMapsUri) { window.open(item.googleMapsUri, '_blank'); return; }
  if (item.websiteUri)    { window.open(item.websiteUri, '_blank'); return; }
}

// ─────────────────────────────────────────────────────────
// DOPE DETOURS — enter a destination, get 3-5 quality-driven stops
// within a 13-mile corridor of the path to it. Uses ONLY Places API
// (New) — the same product already active for restaurants/Cool Stuff/
// curated photos — via a straight-line interpolation between your
// location and the destination, not the actual curving road (that
// would require Directions API, a separate Google Cloud product).
// For a reasonably direct route this works well; for a route that
// curves a lot, some suggestions may land near the line but not
// exactly on the real road. Deliberately reuses the existing Cool
// Stuff live search (category=coolstuff) at several points along
// that line rather than building a new search pipeline — selection
// is quality-driven (fun/quirky/popular/interesting), not tied to
// even geographic spacing.
// ─────────────────────────────────────────────────────────
var dopeDetoursResults = [];
var dopeDetoursLoading = false;
var DOPEDETOURS_CORRIDOR_MILES = 13;

function onDopeDetoursGo() {
  var input = document.getElementById('dopeDetoursInput');
  if (!input) return;
  var destination = input.value.trim();
  if (!destination) return;
  loadDopeDetours(destination);
}

function dopeDetoursShowLoading(message) {
  var cards = document.getElementById('cards');
  var list  = document.getElementById('list');
  var sep   = document.querySelector('.sep');
  var lbl   = document.getElementById('listLabel');
  if (list) list.style.display = 'none';
  if (sep)  sep.style.display  = 'none';
  if (lbl)  lbl.style.display  = 'none';
  if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">' + escHtml(message) + '</div></div>';
  setMsg(message);
}

function loadDopeDetours(destination) {
  if (dopeDetoursLoading) return;
  if (activeCategory !== 'dopedetours') return;
  if (userLat === null || userLon === null) {
    dopeDetoursShowLoading('Waiting for your GPS location…');
    var waitTimer = setInterval(function() {
      if (userLat !== null && userLon !== null) {
        clearInterval(waitTimer);
        loadDopeDetours(destination);
      }
    }, 500);
    return;
  }

  dopeDetoursLoading = true;
  dopeDetoursShowLoading('Mapping your route…');
  var routeInfo = document.getElementById('dopeDetoursRouteInfo');
  if (routeInfo) routeInfo.textContent = '';

  var dirUrl = 'https://roadguide-lime.vercel.app/api/directions?originLat=' + encodeURIComponent(userLat)
             + '&originLng=' + encodeURIComponent(userLon) + '&destination=' + encodeURIComponent(destination);

  fetch(dirUrl)
    .then(function(response) {
      if (!response.ok) {
        return response.json().then(function(err) { throw new Error(err.error || ('HTTP ' + response.status)); });
      }
      return response.json();
    })
    .then(function(data) {
      var waypoints = Array.isArray(data.waypoints) ? data.waypoints : [];
      if (!waypoints.length) throw new Error('No route found to that destination.');

      if (routeInfo && data.distanceText) {
        routeInfo.textContent = 'Route: ' + data.distanceText;
      }

      dopeDetoursShowLoading('Scouting stops along the way…');

      var radiusMeters = Math.round(DOPEDETOURS_CORRIDOR_MILES * 1609.34);
      var searches = waypoints.map(function(wp) {
        var url = 'https://roadguide-lime.vercel.app/api/landmarks?category=coolstuff&lat=' + encodeURIComponent(wp.lat)
                + '&lng=' + encodeURIComponent(wp.lng) + '&radius=' + radiusMeters;
        return fetch(url)
          .then(function(response) { return response.ok ? response.json() : { landmarks: [] }; })
          .then(function(d) { return Array.isArray(d.landmarks) ? d.landmarks : []; })
          .catch(function() { return []; });
      });

      return Promise.all(searches);
    })
    .then(function(resultsPerWaypoint) {
      dopeDetoursLoading = false;

      // Merge + dedupe by place id across all waypoint searches —
      // overlapping 13-mile circles along a route will often return
      // the same place more than once.
      var seen = {};
      var merged = [];
      resultsPerWaypoint.forEach(function(list) {
        list.forEach(function(place) {
          var key = place.id || place.name;
          if (seen[key]) return;
          seen[key] = true;
          merged.push(place);
        });
      });

      if (!merged.length) {
        dopeDetoursShowLoading('No great stops found along that route — try a different destination.');
        return;
      }

      // Hard exclude anything with a huge review count — this is the
      // single most reliable, checkable signal Places data offers for
      // "this is a major, already-famous destination" (Universal
      // Studios has 150,000+ reviews, Hollywood Bowl 30,000+, Walt
      // Disney Concert Hall 20,000+ — a genuine hidden gem virtually
      // never accumulates review volume anywhere near this). This is
      // Dope Detours-specific — Cool Stuff's own tab is untouched.
      var DOPE_DETOURS_REVIEW_CEILING = 3000;
      var filtered = merged.filter(function(place) {
        var reviewCount = Number(place.reviewCount || 0);
        return reviewCount <= DOPE_DETOURS_REVIEW_CEILING;
      });

      if (!filtered.length) {
        dopeDetoursShowLoading('No hidden-gem-style stops found along that route — try a different destination.');
        return;
      }

      // Score using bucket-weight + rating quality + "fun", same as
      // Explore/Cool Stuff — but deliberately WITHOUT any review-count
      // reward this time. Rewarding review volume is exactly what
      // would surface major/famous destinations instead of quirky,
      // lesser-known ones — the review ceiling above already excludes
      // the extreme cases; removing the reward here stops it from
      // favoring "somewhat well-known" over "genuine discovery" too.
      var scored = filtered.map(function(place) {
        var lat = (place.latitude  != null) ? Number(place.latitude)  : NaN;
        var lon = (place.longitude != null) ? Number(place.longitude) : NaN;
        // Distance shown is from the user's CURRENT location, not
        // from the route or the search waypoint.
        var dist = (Number.isFinite(lat) && Number.isFinite(lon)) ? haversine(userLat, userLon, lat, lon) : null;
        var dir  = (Number.isFinite(lat) && Number.isFinite(lon)) ? bearing(userLat, userLon, lat, lon) : '';
        var rating = Number(place.rating || 0);
        var bucket = place.bucket || 'iconic';
        var typeWeight = EXPLORE_BUCKET_WEIGHTS[bucket] || 24;
        var qualityBonus = Math.max(0, rating - 3.5) * 3;
        var funBonus = place.isFun ? 4 : 0;
        var prefAdj = hasAnyActivePreference() ? landmarkPreferenceAdjustment(bucket, place.isFun) : 0;
        var score = typeWeight + qualityBonus + funBonus + prefAdj;
        return Object.assign({}, place, { origin: 'live', dist: dist, dir: dir, _score: score });
      });

      scored.sort(function(a, b) { return b._score - a._score; });
      var picks = scored.slice(0, 5);

      dopeDetoursResults = picks;
      dopeDetoursRenderResults(picks);
    })
    .catch(function(error) {
      dopeDetoursLoading = false;
      console.error('Dope Detours error:', error);
      dopeDetoursShowLoading(error.message || 'Could not find that destination — try again.');
    });
}

// Trims the existing 2-sentence Wikipedia extract down to one
// sentence, reusing the same source rather than a new extraction step.
function dopeDetoursOneSentence(text) {
  if (!text) return '';
  var match = text.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : text;
}

function dopeDetoursRenderResults(picks) {
  if (activeCategory !== 'dopedetours') return;
  var cards   = document.getElementById('cards');
  var countEl = document.getElementById('catCount');
  var dc      = document.getElementById('dc');

  if (!picks.length) {
    dopeDetoursShowLoading('No great stops found along that route.');
    return;
  }

  setMsg(picks.length + ' stops along your route');
  if (countEl) countEl.textContent = picks.length + ' stops along your route';
  if (dc) dc.textContent = picks.length;
  if (cards) cards.style.display = '';

  var html = '';
  for (var i = 0; i < picks.length; i++) {
    var item = Object.assign({}, picks[i]);
    item.funFacts = dopeDetoursOneSentence(item.funFacts);
    html += exploreBlendedCardHTML(item, i, true, 'openDopeDetoursItem');
  }
  cards.innerHTML = html;
}

function openDopeDetoursItem(index) {
  var item = dopeDetoursResults[index];
  if (!item) return;
  if (item.googleMapsUri) { window.open(item.googleMapsUri, '_blank'); return; }
  if (item.websiteUri)    { window.open(item.websiteUri, '_blank'); return; }
}

// "Surprise Me" deliberately does NOT reuse Quirky's search — it pulls
// from all four other moods (Museums, Quirky, Scenic, Artsy) and mixes
// them, automatically inheriting each one's text-search supplements
// since it calls the same pool-builder functions they use. The mix is
// intentionally NOT a fixed 25%-each split (that would feel
// mechanical) — instead, the four source pools and the final result
// count are both randomized per tap, so sometimes 3 categories show
// up, sometimes all 4 with one appearing twice, and which categories
// those are changes every time.
function hookMeUpFetchSurpriseMe() {
  Promise.all([
    hookMeUpBuildBlendedPool('museum', isCuratedMuseumEntry, '🔭', {
      queries: 'science museum,natural history museum,maritime museum,transportation museum,specialty museum'
    }),
    hookMeUpBuildBlendedPool('coolstuff', isCuratedCoolStuffEntry, '😎', {
      queries: 'quirky attraction,unusual attraction,strange attraction,roadside attraction,unusual museum,unusual collection,historic oddity,quirky local attraction,hidden gem'
    }),
    hookMeUpBuildLiveOnlyPool('nature', {
      queries: 'scenic overlook,waterfall,coastal viewpoint,arboretum,lookout point'
    }),
    hookMeUpBuildLiveOnlyPool('artsy', {
      queries: 'mural,street art,public art,art installation,sculpture installation,art district,creative space,artist studio,unusual gallery,design landmark,architecture landmark',
      allowSculpture: true
    })
  ]).then(function(pools) {
    // Dedupe across all four pools FIRST (art_gallery-type places can
    // legitimately appear in both the Quirky and Artsy searches) —
    // first occurrence wins, tagged with whichever source found it.
    var seen = {};
    var groups = [[], [], [], []]; // museums, quirky, scenic, artsy
    pools.forEach(function(pool, groupIndex) {
      pool.forEach(function(item) {
        var key = item.id || item.name;
        if (seen[key]) return;
        seen[key] = true;
        groups[groupIndex].push(item);
      });
    });

    var picks = hookMeUpDiverseRandomPick(groups, 3, 5);

    if (!picks.length) {
      hookMeUpShowLoading('Nothing found right now — try again in a moment.');
      return;
    }
    hookMeUpRenderResults(picks);
  }).catch(function(error) {
    console.error('Surprise Me loading error:', error);
    hookMeUpShowLoading('Nothing found right now — try again in a moment.');
  });
}

// Shuffles a copy of an array (Fisher-Yates) without mutating the original.
function hookMeUpShuffled(arr) {
  var copy = arr.slice();
  for (var i = copy.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
  }
  return copy;
}

// Picks 3-5 items total, round-robining across a RANDOM ORDER of the
// non-empty groups. With 4 groups and a random target of 3, only 3 of
// the 4 groups end up represented (whichever land first in the
// shuffled order) — with a target of 5, one random group contributes
// a second pick. Both the target count AND which group(s) get
// skipped/doubled change every call, so it never settles into a
// predictable, mechanical pattern while still guaranteeing spread.
function hookMeUpDiverseRandomPick(groups, min, max) {
  var targetCount = min + Math.floor(Math.random() * (max - min + 1));
  var preferenceActive = hasAnyActivePreference();

  var orderedGroups = groups
    .map(function(g) {
      if (!preferenceActive) return hookMeUpShuffled(g); // exact existing behavior

      // Preferences active: sort each group by preference-adjusted
      // score (best first) so the preference influences WHICH item
      // wins within a category, not just the display order of an
      // already-fixed set afterward.
      var scored = g.map(function(item) {
        var rating = Number(item.rating || 0);
        var qualityBonus = Math.max(0, rating - 3.5) * 3;
        var reviewCount = landmarkEffectiveReviewCount(item.reviewCount || 0);
        var reviewBonus = Math.log10(reviewCount + 1) * landmarkReviewWeight();
        var typeWeight = item.bucket ? (EXPLORE_BUCKET_WEIGHTS[item.bucket] || 24) : 24;
        var prefAdj = item.bucket ? landmarkPreferenceAdjustment(item.bucket, item.isFun) : 0;
        return Object.assign({}, item, { _prefScore: typeWeight + qualityBonus + reviewBonus + prefAdj });
      });
      scored.sort(function(a, b) { return b._prefScore - a._prefScore; });
      return scored.map(function(item) {
        var clean = Object.assign({}, item);
        delete clean._prefScore;
        return clean;
      });
    })
    .filter(function(g) { return g.length > 0; });

  // Group ORDER stays randomly shuffled regardless of preferences —
  // this is what preserves genuine cross-category surprise even when
  // a preference is active; preferences decide which item wins
  // within a category, not which categories get to contribute.
  var shuffledGroups = hookMeUpShuffled(orderedGroups);

  var picks = [];
  var madeProgress = true;
  while (picks.length < targetCount && madeProgress) {
    madeProgress = false;
    for (var i = 0; i < shuffledGroups.length && picks.length < targetCount; i++) {
      if (!shuffledGroups[i].length) continue;
      picks.push(shuffledGroups[i].shift());
      madeProgress = true;
    }
  }
  return picks;
}

function openWorldLandmark(index) {
  var lm = worldLandmarkResults[index];
  if (!lm) return;
  if (lm.googleMapsUri) { window.open(lm.googleMapsUri, '_blank'); return; }
  if (lm.websiteUri)    { window.open(lm.websiteUri, '_blank'); return; }
}

// ─────────────────────────────────────────────────────────
// OPEN CHATGPT — pre-loads landmark context as the prompt
// User just taps the mic button in ChatGPT to start talking
// ─────────────────────────────────────────────────────────
function openGemini() {
  var name = document.getElementById('oname').innerText;
  var prompt = encodeURIComponent('You are my tour guide. I am standing at ' + name + ' in California. Give me a fascinating introduction about this place, then ask what I would like to know more about. I will be speaking to you by voice.');
  window.open('https://chatgpt.com/?q=' + prompt, '_blank');
}

// ═════════════════════════════════════════════════════════
// DEV TEST LOCATION MODE — TEMPORARY DEVELOPER TOOL
// Lets you preview restaurant/landmark search results from other
// cities without physically traveling there. Overrides only the
// single userLat/userLon choke point that every search and distance
// calculation in the app already reads from — no restaurant, world
// landmark, or curated-California logic is duplicated or modified.
//
// TO REMOVE THIS FEATURE LATER: delete this entire block (from the
// "DEV TEST LOCATION MODE" header above to the end of the file), and
// revert the small onPos() change that reads devTestLat back to its
// original two-line form. Nothing else in the app depends on this.
// ═════════════════════════════════════════════════════════
var DEV_TEST_LOCATIONS = [
  { label: 'Current GPS Location', lat: null,     lon: null },
  { label: 'Honolulu, Hawaii',     lat: 21.3069,  lon: -157.8583 },
  { label: 'Kauai, Hawaii',        lat: 21.9811,  lon: -159.3711 },
  { label: 'Vancouver, Canada',    lat: 49.2827,  lon: -123.1207 },
  { label: 'Mexico City, Mexico',  lat: 19.4326,  lon: -99.1332 },
  { label: 'Tokyo, Japan',         lat: 35.6762,  lon: 139.6503 },
  { label: 'Kyoto, Japan',         lat: 35.0116,  lon: 135.7681 },
  { label: 'Bangkok, Thailand',    lat: 13.7563,  lon: 100.5018 },
  { label: 'London, England',      lat: 51.5074,  lon: -0.1278 },
  { label: 'San Francisco, CA',    lat: 37.7749,  lon: -122.4194 },
  { label: 'Walnut Creek, CA',     lat: 37.9101,  lon: -122.0652 }
];

var devTestLat   = null;  // non-null while a test location is active
var devTestLon   = null;
var devTestLabel = null;
var realGpsLat   = null;  // last known REAL device GPS reading, always kept up to date
var realGpsLon   = null;

(function initDevTestLocationTool() {

  var banner = document.createElement('div');
  banner.id = 'devTestBanner';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:9999;display:none;' +
    'background:#e05555;color:#fff;text-align:center;padding:calc(5px + env(safe-area-inset-top,0px)) 6px 5px;' +
    "font-family:'DM Mono',monospace;font-size:11px;font-weight:700;" +
    'letter-spacing:.3px;pointer-events:none;';
  document.body.appendChild(banner);

  var select = document.createElement('select');
  select.id = 'devTestLocationSelect';
  select.setAttribute('aria-label', 'Developer test location (temporary)');
  select.style.cssText =
    'position:fixed;bottom:calc(10px + env(safe-area-inset-bottom,0px));right:calc(10px + env(safe-area-inset-right,0px));z-index:9999;max-width:46vw;' +
    "font-family:'DM Mono',monospace;font-size:10px;color:var(--pale);" +
    'background:rgba(8,12,20,.88);border:1px solid rgba(255,255,255,.18);' +
    'border-radius:6px;padding:5px 4px;opacity:.6;';

  DEV_TEST_LOCATIONS.forEach(function(loc, i) {
    var opt = document.createElement('option');
    opt.value = i;
    opt.textContent = (i === 0 ? '📍 ' : '🧪 ') + loc.label;
    select.appendChild(opt);
  });

  select.addEventListener('change', function() {
    var i = Number(select.value);
    var loc = DEV_TEST_LOCATIONS[i];

    if (!loc || i === 0 || loc.lat === null) {
      // "Current GPS Location" — restore real GPS immediately.
      devTestLat = null;
      devTestLon = null;
      devTestLabel = null;
      if (realGpsLat !== null && realGpsLon !== null) {
        userLat = realGpsLat;
        userLon = realGpsLon;
      }
      banner.style.display = 'none';
    } else {
      devTestLat = loc.lat;
      devTestLon = loc.lon;
      devTestLabel = loc.label;
      userLat = loc.lat;
      userLon = loc.lon;
      banner.textContent = '🧪 TEST LOCATION: ' + loc.label;
      banner.style.display = 'block';
    }

    // Force a fresh fetch for the new coordinates rather than
    // silently reusing whatever was already loaded.
    restaurantsLoaded     = false;
    restaurantsLoading    = false;
    worldLandmarksLoaded  = false;
    worldLandmarksLoading = false;
    PLACE_CATEGORIES.coffee.loaded  = false;
    PLACE_CATEGORIES.coffee.loading = false;
    PLACE_CATEGORIES.bar.loaded     = false;
    PLACE_CATEGORIES.bar.loading    = false;

    try {
      if (activeCategory === 'restaurants') {
        loadRestaurants();
      } else if (activeCategory === 'coffee' || activeCategory === 'bar') {
        loadPlacesCategory(activeCategory);
      } else if (activeCategory === 'hookmeup') {
        // Re-run whatever mood is currently selected, if any, with
        // the new coordinates — otherwise leave the picker waiting.
        var hmuSelect = document.getElementById('hookMeUpSelect');
        if (hmuSelect && hmuSelect.value) loadHookMeUpMood(hmuSelect.value);
      } else if (activeCategory === 'dopedetours') {
        var ddInputEl = document.getElementById('dopeDetoursInput');
        if (ddInputEl && ddInputEl.value.trim()) loadDopeDetours(ddInputEl.value.trim());
      } else {
        sortAndRender();
      }
    } catch (err) {
      console.error('[DEV TEST MODE] Error applying test location:', err);
    }
  });

  document.body.appendChild(select);
})();

// ─────────────────────────────────────────────────────────
// BACKGROUND MUSIC — completely self-contained, touches nothing else
// in this file. iOS blocks true autoplay without a user gesture, so
// this attempts to start on the first tap/touch anywhere in the app
// (which normally happens within a second or two regardless), and
// the floating button always lets the user mute/unmute manually.
// ─────────────────────────────────────────────────────────
(function initBackgroundMusic() {
  var audio = document.getElementById('bgMusic');
  var btn = document.getElementById('musicToggleBtn');
  if (!audio || !btn) return;

  audio.volume = 0.25; // 25% volume, set once before any playback attempt

  var startAttempted = false;

  function attemptAutoStart() {
    if (startAttempted) return;
    startAttempted = true;
    audio.play().catch(function(err) {
      console.warn('Background music could not auto-start:', err.message);
    });
    document.removeEventListener('touchstart', attemptAutoStart);
    document.removeEventListener('click', attemptAutoStart);
  }

  document.addEventListener('touchstart', attemptAutoStart, { once: true, passive: true });
  document.addEventListener('click', attemptAutoStart, { once: true });

  window.toggleMusicMute = function() {
    if (audio.paused) {
      audio.muted = false;
      audio.play().catch(function(err) {
        console.warn('Background music play failed:', err.message);
      });
      btn.textContent = '🔊';
      return;
    }
    audio.muted = !audio.muted;
    btn.textContent = audio.muted ? '🔇' : '🔊';
  };
})();
