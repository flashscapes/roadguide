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
var activeCategory  = null;

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
  btn.className = 'cat-chip';
  btn.textContent = '🍴 Restaurants';
  btn.onclick = function() { setCat('restaurants', btn); };
  // Insert as the 2nd chip (right after "All")
  catScroll.insertBefore(btn, catScroll.children[1] || null);
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
    // 3rd chip (right after "All" and "Restaurants")
    catScroll.insertBefore(coffeeBtn, catScroll.children[2] || null);
  }

  if (!document.getElementById('barChip')) {
    var barBtn = document.createElement('button');
    barBtn.id = 'barChip';
    barBtn.className = 'cat-chip';
    barBtn.textContent = '🍺 Bar/Food';
    barBtn.onclick = function() { setCat('bar', barBtn); };
    // 4th chip (right after Coffee Shops)
    catScroll.insertBefore(barBtn, catScroll.children[3] || null);
  }
})();

// ─────────────────────────────────────────────────────────
// ADD WORLD LANDMARKS CATEGORY BUTTON (worldwide, Places-powered)
// ─────────────────────────────────────────────────────────
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
  if (cat === 'restaurants' || cat === 'coffee' || cat === 'bar' || cat === 'culture') {
    if (evPane)  evPane.classList.remove('active');
    if (cards)   cards.style.display  = '';
    if (sep)     sep.style.display    = '';
    if (list)    list.style.display   = '';
    if (lbl)     lbl.style.display    = '';
    if (listen)  listen.style.display = '';
    activeCategory = cat;
    if (cat === 'restaurants') loadRestaurants();
    else if (cat === 'culture') loadCulture();
    else loadPlacesCategory(cat);
    return;
  }
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
  if (activeCategory === 'restaurants' || activeCategory === 'coffee' || activeCategory === 'bar' || activeCategory === 'culture') return [];
  var c = activeCategory;
  return ALL_LANDMARKS.filter(function(lm) {
    var cat = (lm.cat || '').toLowerCase();
    if (c === 'historic')   return /historic|fort|ruin|memorial|cemetery|adobe|plaza|landmark|shipyard|powder|arsenal|ranch|district|neighborhood|hotel|theater|theatre|town|building|farm|ship|prison|ruins|hacienda|estate/.test(cat);
    if (c === 'nature')     return /natural|geological|wetland|marsh|lagoon|estuary|waterway|mountain|reservoir|lake|valley|open space|forest|bay|dune|canyon|wilderness|waterfall|feature|creek|river|natural area/.test(cat);
    if (c === 'winery')     return /winery|wine|vineyard|wine region/.test(cat);
    if (c === 'beach')      return /beach|shoreline|cove|coast/.test(cat);
    if (c === 'park')       return /park|preserve|recreation|garden/.test(cat);
    if (c === 'museum')     return /^museum$|^science center$|^planetarium$|^aquarium$|^space center$|^zoo$|^observatory$|^history museum$|^art museum$|^children's museum$/.test(cat);
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
  if (activeCategory === 'culture') {
    if (!cultureLoaded && !cultureLoading) loadCulture();
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
  if (activeCategory === 'culture') {
    renderCulture();
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
          + '&lng=' + encodeURIComponent(userLon) + '&radius=5000';
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
      +   '<span class="rest-action-label">Directions in Google Maps</span>'
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
          + '&lat=' + encodeURIComponent(userLat) + '&lng=' + encodeURIComponent(userLon) + '&radius=5000';

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
      +   '<span class="rest-action-label">Directions in Google Maps</span>'
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
      +   '<span class="rest-action-label">Directions in Google Maps</span>'
      + '</a>'
    : '<div class="rest-action rest-action-primary rest-action-disabled">'
      +   '<span class="rest-action-ico" aria-hidden="true">📍</span>'
      +   '<span class="rest-action-label">Directions unavailable</span>'
      + '</div>';

  var youtubeUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(lm.name);
  var youtubeHTML =
      '<a class="rest-action rest-action-secondary" href="' + escHtml(youtubeUrl) + '" target="_blank" rel="noopener" ontouchstart="" onclick="event.stopPropagation()">'
    +   '<span class="rest-action-label">Watch on YouTube</span>'
    +   '<span class="rest-action-ico" aria-hidden="true">▶</span>'
    + '</a>';

  return '<div class="rest-actions">' + directionsHTML + youtubeHTML + '</div>';
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
        +   '<span class="rest-action-label">Directions in Google Maps</span>'
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

// ─────────────────────────────────────────────────────────
// SCREEN & CULTURE (worldwide, Google Places-powered, blended with
// curated CA film-location entries). Unlike Explore, this is a
// single category — no bucket diversity needed, just merge curated +
// live and sort by distance, matching how Restaurants/Coffee/Bar
// already display results nearest-first.
// ─────────────────────────────────────────────────────────
var cultureResults = [];
var cultureLoaded = false;
var cultureLoading = false;
var cultureBlendedResults = [];
var CULTURE_MAX_MILES = 15;

// Deliberately narrow: only your curated film-location entries. The
// live side covers the full Arts/Pop/Local Culture breadth per the
// spec, but broadening curated-matching to Historic/Winery/Museum-
// style cat values would just duplicate content those dedicated tabs
// already show.
function isCuratedCultureEntry(lm) {
  return /movie|tv|film/.test((lm.cat || '').toLowerCase());
}

function loadCulture() {
  if (cultureLoading) return;
  if (userLat === null || userLon === null) {
    setMsg('Waiting for your GPS location…');
    var waitTimer = setInterval(function() {
      if (userLat !== null && userLon !== null) {
        clearInterval(waitTimer);
        loadCulture();
      }
    }, 500);
    return;
  }
  cultureLoading = true;
  cultureLoaded  = false;
  setMsg('Searching for nearby Culture spots…');
  var url = 'https://roadguide-lime.vercel.app/api/landmarks?category=culture&lat=' + encodeURIComponent(userLat)
          + '&lng=' + encodeURIComponent(userLon) + '&radius=24140';
  fetch(url)
    .then(function(response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    })
    .then(function(data) {
      cultureLoading = false;
      cultureLoaded  = true;
      cultureResults = Array.isArray(data.landmarks) ? data.landmarks : [];
      renderCulture();
    })
    .catch(function(error) {
      cultureLoading = false;
      cultureLoaded  = true;
      console.error('Culture loading error:', error);
      cultureResults = [];
      setMsg('Live search unavailable right now — showing your curated spots.');
      renderCulture();
    });
}

function renderCulture() {
  if (activeCategory !== 'culture') return;
  var cards   = document.getElementById('cards');
  var list    = document.getElementById('list');
  var sep     = document.querySelector('.sep');
  var lbl     = document.getElementById('listLabel');
  var countEl = document.getElementById('catCount');
  var dc      = document.getElementById('dc');

  var curatedCulture = ALL_LANDMARKS.filter(isCuratedCultureEntry).map(function(lm) {
    var dist = (userLat !== null && userLon !== null && lm.lat != null && lm.lon != null)
      ? haversine(userLat, userLon, lm.lat, lm.lon) : null;
    if (dist != null && dist > CULTURE_MAX_MILES) return null;
    var dir = (userLat !== null && userLon !== null && lm.lat != null && lm.lon != null)
      ? bearing(userLat, userLon, lm.lat, lm.lon) : '';
    return {
      origin: 'curated', name: lm.name, county: lm.county || '', emoji: lm.emoji || '🎭',
      lat: lm.lat, lon: lm.lon, fact: lm.fact || '', cat: lm.cat, dist: dist, dir: dir
    };
  }).filter(Boolean);

  var liveCulture = cultureResults.map(function(lm) {
    var lat = (lm.latitude  != null) ? Number(lm.latitude)  : NaN;
    var lon = (lm.longitude != null) ? Number(lm.longitude) : NaN;
    var dist = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? haversine(userLat, userLon, lat, lon) : null;
    var dir  = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? bearing(userLat, userLon, lat, lon) : '';
    return Object.assign({}, lm, { origin: 'live', dist: dist, dir: dir });
  }).filter(function(item) {
    // Belt-and-suspenders: even though the search radius already
    // targets ~15mi, cap display here too in case Google's radius
    // handling ever overshoots slightly.
    return item.dist == null || item.dist <= CULTURE_MAX_MILES;
  });

  var combined = curatedCulture.concat(liveCulture);
  combined.sort(function(a, b) { return (a.dist == null ? Infinity : a.dist) - (b.dist == null ? Infinity : b.dist); });
  combined = combined.slice(0, 28);

  cultureBlendedResults = combined;

  if (!combined.length) {
    setMsg('No genuinely interesting Culture spots found within 15 miles right now.');
    if (countEl) countEl.textContent = 'No Culture spots found nearby';
    if (dc) dc.textContent = '0';
    if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">No nearby Culture spots found</div></div>';
    if (list) list.innerHTML = '';
    return;
  }

  var curatedCount = combined.filter(function(i) { return i.origin === 'curated'; }).length;
  var liveCount = combined.length - curatedCount;

  if (dc) {
    var nearby = combined.filter(function(i) { return i.dist != null && i.dist < 5; }).length;
    dc.textContent = nearby;
  }
  setMsg(combined.length + ' spots · ' + curatedCount + ' curated, ' + liveCount + ' discovered live');
  if (countEl) countEl.textContent = combined.length + ' nearby spots';
  if (cards) cards.style.display = '';
  if (sep) sep.style.display = '';
  if (lbl) { lbl.style.display = ''; lbl.textContent = 'More Nearby Spots'; }
  if (list) list.style.display = '';

  renderCultureCards();
  renderCultureList();

  var curatedForPhotos = [];
  combined.forEach(function(item, idx) {
    if (item.origin === 'curated') {
      curatedForPhotos.push({ id: idx, name: item.name, county: item.county, lat: item.lat, lon: item.lon });
    }
  });
  loadCuratedPhotos(curatedForPhotos);
}

function renderCultureCards() {
  var cards = document.getElementById('cards');
  if (!cards) return;
  var html = '';
  for (var i = 0; i < HERO_COUNT; i++) {
    var item = cultureBlendedResults[i];
    html += item
      ? exploreBlendedCardHTML(item, i, true, 'openCultureItem')
      : '<div class="card"><div class="card-placeholder">No additional spots</div></div>';
  }
  cards.innerHTML = html;
}

function renderCultureList() {
  var list = document.getElementById('list');
  if (!list) return;
  var items = cultureBlendedResults.slice(HERO_COUNT, HERO_COUNT + 21);
  if (!items.length) {
    list.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:8px 0">No additional spots</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    html += exploreBlendedCardHTML(items[i], i + HERO_COUNT, false, 'openCultureItem');
  }
  list.innerHTML = html;
}

function openCultureItem(index) {
  var item = cultureBlendedResults[index];
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
    cultureLoaded   = false;
    cultureLoading  = false;
    PLACE_CATEGORIES.coffee.loaded  = false;
    PLACE_CATEGORIES.coffee.loading = false;
    PLACE_CATEGORIES.bar.loaded     = false;
    PLACE_CATEGORIES.bar.loading    = false;

    try {
      if (activeCategory === 'restaurants') {
        loadRestaurants();
      } else if (activeCategory === 'coffee' || activeCategory === 'bar') {
        loadPlacesCategory(activeCategory);
      } else if (activeCategory === 'culture') {
        loadCulture();
      } else {
        sortAndRender();
      }
    } catch (err) {
      console.error('[DEV TEST MODE] Error applying test location:', err);
    }
  });

  document.body.appendChild(select);
})();
