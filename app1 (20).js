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
// your curated ALL_LANDMARKS California dataset)
var worldLandmarkResults  = [];
var worldLandmarksLoaded  = false;
var worldLandmarksLoading = false;

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
// ADD WORLD LANDMARKS CATEGORY BUTTON (worldwide, Places-powered)
// ─────────────────────────────────────────────────────────
(function addWorldLandmarksChip() {
  var catScroll = document.getElementById('catScroll');
  if (!catScroll) return;
  if (document.getElementById('worldLandmarksChip')) return;
  var btn = document.createElement('button');
  btn.id = 'worldLandmarksChip';
  btn.className = 'cat-chip';
  btn.textContent = '🗺️ Landmarks';
  btn.onclick = function() { setCat('worldlandmarks', btn); };
  // Insert as the 3rd chip (right after "All" and "Restaurants") —
  // does not touch or move the Restaurants chip.
  catScroll.insertBefore(btn, catScroll.children[2] || null);
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
  if (cat === 'restaurants' || cat === 'worldlandmarks') {
    if (evPane)  evPane.classList.remove('active');
    if (cards)   cards.style.display  = '';
    if (sep)     sep.style.display    = '';
    if (list)    list.style.display   = '';
    if (lbl)     lbl.style.display    = '';
    if (listen)  listen.style.display = '';
    activeCategory = cat;
    if (cat === 'restaurants') loadRestaurants();
    else loadWorldLandmarks();
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
  if (activeCategory === 'restaurants' || activeCategory === 'worldlandmarks') return [];
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
    if (c === 'film')       return /movie|tv|film/.test(cat);
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
  if (activeCategory === 'restaurants') {
    if (!restaurantsLoaded && !restaurantsLoading) loadRestaurants();
    return;
  }
  if (activeCategory === 'worldlandmarks') {
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
  if (activeCategory === 'worldlandmarks') {
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
    return { id: i, name: lm.name, county: lm.county || '', lat: lm.lat, lon: lm.lon };
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
        if (!p || !p.photoRef) return;
        var slot = document.getElementById('curatedPhotoSlot' + p.id);
        if (!slot || !slot.parentNode) return;

        var photoUrl = 'https://roadguide-lime.vercel.app/api/photo?ref=' + encodeURIComponent(p.photoRef) + '&maxWidth=300';
        var img = document.createElement('img');
        img.className = 'card-img';
        img.alt = '';
        img.onload = function() { slot.style.display = 'none'; };
        img.onerror = function() { img.remove(); }; // leave emoji showing if the photo fails
        img.src = photoUrl;
        slot.parentNode.insertBefore(img, slot);
      });
    })
    .catch(function(error) {
      // Fail silently — the emoji placeholders are already showing,
      // so there's nothing broken-looking for the user to see.
      console.error('Curated landmark photo lookup failed:', error);
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
      ? '<img class="rest-thumb" src="' + photoUrl + '" alt="' + escHtml(r.name) + '" '
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
      ? '<img class="rest-thumb" src="' + photoUrl + '" alt="' + escHtml(r.name) + '" '
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
      worldLandmarksLoading = false;
      worldLandmarksLoaded  = false;
      console.error('World landmark loading error:', error);
      worldLandmarkResults = [];
      setMsg('Could not load landmarks — ' + error.message);
      renderWorldLandmarkMessage('Could not load nearby landmarks. Please try again.');
    });
}

function renderWorldLandmarkMessage(message) {
  var cards = document.getElementById('cards');
  var list  = document.getElementById('list');
  if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">' + escHtml(message) + '</div></div>';
  if (list) list.innerHTML = '';
}

function renderWorldLandmarks() {
  if (activeCategory !== 'worldlandmarks') return;
  var cards   = document.getElementById('cards');
  var list    = document.getElementById('list');
  var sep     = document.querySelector('.sep');
  var lbl     = document.getElementById('listLabel');
  var countEl = document.getElementById('catCount');
  var dc      = document.getElementById('dc');

  if (!worldLandmarkResults.length) {
    setMsg('No nearby landmarks found.');
    if (countEl) countEl.textContent = 'No landmarks found nearby';
    if (dc) dc.textContent = '0';
    if (cards) cards.innerHTML = '<div class="card"><div class="card-placeholder">No nearby landmarks found</div></div>';
    if (list) list.innerHTML = '';
    return;
  }

  var landmarks = worldLandmarkResults.map(function(lm) {
    var lat = (lm.latitude  != null) ? Number(lm.latitude)  : NaN;
    var lon = (lm.longitude != null) ? Number(lm.longitude) : NaN;
    var dist = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? haversine(userLat, userLon, lat, lon) : null;
    var dir  = (userLat !== null && Number.isFinite(lat) && Number.isFinite(lon)) ? bearing(userLat, userLon, lat, lon) : '';
    return Object.assign({}, lm, { dist: dist, dir: dir });
  });
  landmarks.sort(function(a, b) { return (a.dist == null ? Infinity : a.dist) - (b.dist == null ? Infinity : b.dist); });
  worldLandmarkResults = landmarks;

  if (dc) {
    var nearby = landmarks.filter(function(lm) { return lm.dist != null && lm.dist < 5; }).length;
    dc.textContent = nearby;
  }
  setMsg(landmarks.length + ' landmarks · sorted by distance');
  if (countEl) countEl.textContent = landmarks.length + ' nearby landmarks';
  if (cards) cards.style.display = '';
  if (sep) sep.style.display = '';
  if (lbl) { lbl.style.display = ''; lbl.textContent = 'More Nearby Landmarks'; }
  if (list) list.style.display = '';

  renderWorldLandmarkCards();
  renderWorldLandmarkList();
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
      ? '<img class="rest-thumb" src="' + photoUrl + '" alt="' + escHtml(lm.name) + '" '
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
      ? '<img class="rest-thumb" src="' + photoUrl + '" alt="' + escHtml(lm.name) + '" '
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
          +       factText
          +       worldLandmarkActionsHTML(lm)
          +     '</div>'
          +   '</div>'
          + '</div>';
  }
  list.innerHTML = html;
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
    'background:#e05555;color:#fff;text-align:center;padding:5px 6px;' +
    "font-family:'DM Mono',monospace;font-size:11px;font-weight:700;" +
    'letter-spacing:.3px;pointer-events:none;';
  document.body.appendChild(banner);

  var select = document.createElement('select');
  select.id = 'devTestLocationSelect';
  select.setAttribute('aria-label', 'Developer test location (temporary)');
  select.style.cssText =
    'position:fixed;bottom:10px;right:10px;z-index:9999;max-width:46vw;' +
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

    try {
      if (activeCategory === 'restaurants') {
        loadRestaurants();
      } else if (activeCategory === 'worldlandmarks') {
        loadWorldLandmarks();
      } else {
        sortAndRender();
      }
    } catch (err) {
      console.error('[DEV TEST MODE] Error applying test location:', err);
    }
  });

  document.body.appendChild(select);
})();
