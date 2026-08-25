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
  if (cat === 'restaurants') {
    if (evPane)  evPane.classList.remove('active');
    if (cards)   cards.style.display  = '';
    if (sep)     sep.style.display    = '';
    if (list)    list.style.display   = '';
    if (lbl)     lbl.style.display    = '';
    if (listen)  listen.style.display = '';
    activeCategory = 'restaurants';
    loadRestaurants();
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
  if (activeCategory === 'restaurants') return [];
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
  userLat = pos.coords.latitude;
  userLon = pos.coords.longitude;
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
    var imgHTML  = lm.photo
      ? '<img class="card-img" src="' + lm.photo + '" alt="' + escHtml(lm.name) + '" '
        + 'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
      : '';
    var emojiStyle = lm.photo ? '' : 'display:flex';
    el.innerHTML = imgHTML
      + '<div class="card-emoji" style="' + emojiStyle + '">' + lm.emoji + '</div>'
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
    var imgHTML = lm.photo
      ? '<img class="card-img" src="' + lm.photo + '" alt="' + escHtml(lm.name) + '" '
        + 'onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
      : '';
    var emojiStyle = lm.photo ? '' : 'display:flex';
    html += '<div class="card card-mid" onclick="openOverlay(' + idx + ')">'
          +   imgHTML
          +   '<div class="card-emoji" style="' + emojiStyle + '">' + lm.emoji + '</div>'
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

// Returns raw HTML (a link), not plain text — handled separately in
// restaurantSnapshotHTML so it isn't escHtml-escaped like the others.
function restaurantLinkBullet(r) {
  if (r.websiteUri) {
    return '<a href="' + escHtml(r.websiteUri) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Website &amp; menu</a>';
  }
  if (r.googleMapsUri) {
    return '<a href="' + escHtml(r.googleMapsUri) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">Reservations via Google Maps</a>';
  }
  return 'No website listed';
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

// Fixed 5-bullet order: cuisine, hours, website/menu link,
// outdoor seating, rating+reviews+price.
function restaurantSnapshotHTML(r) {
  var items = [
    escHtml(restaurantCuisineBullet(r)),
    escHtml(restaurantHoursBullet(r)),
    restaurantLinkBullet(r),
    escHtml(restaurantOutdoorBullet(r)),
    escHtml(restaurantRatingBullet(r))
  ];
  return '<ul class="rest-snapshot" style="margin:0 0 8px 0;padding-left:18px;font-size:12px;color:rgba(220,228,255,.82);line-height:1.65;list-style:disc">'
       + items.map(function(t) { return '<li>' + t + '</li>'; }).join('')
       + '</ul>';
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
    var lat = Number(r.latitude);
    var lon = Number(r.longitude);
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
// OPEN CHATGPT — pre-loads landmark context as the prompt
// User just taps the mic button in ChatGPT to start talking
// ─────────────────────────────────────────────────────────
function openGemini() {
  var name = document.getElementById('oname').innerText;
  var prompt = encodeURIComponent('You are my tour guide. I am standing at ' + name + ' in California. Give me a fascinating introduction about this place, then ask what I would like to know more about. I will be speaking to you by voice.');
  window.open('https://chatgpt.com/?q=' + prompt, '_blank');
}
