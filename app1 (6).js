// ─────────────────────────────────────────────────────────
// BUILD MASTER LANDMARK ARRAY FROM ALL LOADED JS FILES
// Handles: LANDMARKS, LANDMARKS_SOUTH, LANDMARKS_TOPUP
// and landmarks_bayarea_film (different schema — optional)
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
// RENDER TOP 2 CARDS
// ─────────────────────────────────────────────────────────
function renderCards() {
  for (var i = 0; i < 2; i++) {
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
      +       '<div class="card-rank">' + (i === 0 ? '▲ NEAREST' : '▲ 2ND NEAREST') + '</div>'
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
      +   '<a class="yt-link" href="https://www.youtube.com/results?search_query=' + encodeURIComponent(lm.name) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">&#9654; Watch on YouTube</a>'
      + '</div>';
  }
}

// ─────────────────────────────────────────────────────────
// RENDER SCROLLABLE LIST
// ─────────────────────────────────────────────────────────
function renderList() {
  var list  = document.getElementById('list');
  var items = sorted.slice(2, 15);
  if (!items.length) {
    list.innerHTML = '<div style="font-family:\'DM Mono\',monospace;font-size:10px;color:var(--dim);padding:8px 0">No additional landmarks in this category</div>';
    return;
  }
  var html = '';
  for (var i = 0; i < items.length; i++) {
    var lm  = items[i];
    var idx = i + 2;
    var distLabel = (lm.dist != null) ? lm.dist.toFixed(1) + ' mi' : '—';
    var thumbHTML = lm.photo
      ? '<img class="litem-thumb" src="' + lm.photo + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'">'
        + '<div class="litem-thumb-em" style="display:none">' + lm.emoji + '</div>'
      : '<div class="litem-thumb-em">' + lm.emoji + '</div>';
    html += '<div class="litem" onclick="openOverlay(' + idx + ')">'
          +   thumbHTML
          +   '<div class="litem-info">'
          +     '<div class="litem-name">' + escHtml(lm.name) + '</div>'
          +     '<div class="litem-sub">'  + escHtml(lm.county) + (lm.cat ? ' · ' + escHtml(lm.cat) : '') + '</div>'
          +   '</div>'
          +   '<div class="litem-dist">' + distLabel + '</div>'
          + '</div>';
  }
  list.innerHTML = html;
}

// ─────────────────────────────────────────────────────────
// KOKORO TTS ENGINE — free, unlimited, on-device, no API key
// Replaces ElevenLabs + browserSpeak
// ─────────────────────────────────────────────────────────

var _kokoroTTS     = null;
var _kokoroReady   = false;
var _kokoroLoading = false;
var _kokoroAudio   = null;
var _kokoroCtx     = null;
var _kokoroSpeaking = false;

async function loadKokoro() {
  if (_kokoroReady || _kokoroLoading) return;
  _kokoroLoading = true;
  setMsg('Loading voice engine… (one-time download)');
  try {
    const { KokoroTTS } = await import(
      'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.0/dist/kokoro.js'
    );
    _kokoroTTS    = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-ONNX',
      { dtype: 'q8' }
    );
    _kokoroReady   = true;
    _kokoroLoading = false;
    setMsg('Voice engine ready ✓');
  } catch (err) {
    _kokoroLoading = false;
    console.warn('Kokoro load failed, will use browser voice:', err);
    setMsg('Using system voice');
  }
}

if ('requestIdleCallback' in window) {
  requestIdleCallback(loadKokoro);
} else {
  setTimeout(loadKokoro, 2000);
}

async function xiSpeak(text, onStart, onEnd) {
  xiStop();
  if (!_kokoroReady) {
    loadKokoro();
    browserSpeak(text, onStart, onEnd);
    return true;
  }
  _kokoroSpeaking = true;
  if (onStart) onStart();
  try {
    const audio = await _kokoroTTS.generate(text, { voice: 'af_bella' });
    if (!_kokoroCtx || _kokoroCtx.state === 'closed') {
      _kokoroCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (_kokoroCtx.state === 'suspended') await _kokoroCtx.resume();
    const sampleRate = audio.sampling_rate || 24000;
    const pcm        = audio.audio;
    const buffer     = _kokoroCtx.createBuffer(1, pcm.length, sampleRate);
    buffer.copyToChannel(pcm, 0);
    const source = _kokoroCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(_kokoroCtx.destination);
    source.onended = function() {
      _kokoroSpeaking = false;
      _kokoroAudio    = null;
      if (onEnd) onEnd();
    };
    _kokoroAudio = source;
    source.start(0);
  } catch (err) {
    console.warn('Kokoro speak error, falling back:', err);
    _kokoroSpeaking = false;
    browserSpeak(text, onStart, onEnd);
  }
  return true;
}

function xiStop() {
  if (_kokoroAudio) {
    try { _kokoroAudio.stop(); } catch(e) {}
    _kokoroAudio    = null;
    _kokoroSpeaking = false;
  }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function browserSpeak(text, onStart, onEnd) {
  if (!window.speechSynthesis) { if (onEnd) onEnd(); return; }
  var utt  = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';
  utt.rate = 0.92;
  var v = getVoice(); if (v) utt.voice = v;
  utt.onstart = onStart;
  utt.onend = utt.onerror = onEnd;
  window.speechSynthesis.speak(utt);
}

function isSpeaking() {
  return _kokoroSpeaking ||
         (window.speechSynthesis && window.speechSynthesis.speaking);
}

var selectedVoice = null;

function populateVoices() {
  if (!window.speechSynthesis) return;
  var voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  var sel = document.getElementById('voiceSelect');
  if (!sel) return;
  var wrap = document.getElementById('voiceWrap');
  if (wrap) wrap.style.display = 'none';
  sel.innerHTML = '';
  var saved  = localStorage.getItem('rg_voice');
  var chosen = (saved ? voices.find(function(v){ return v.name === saved; }) : null)
             || voices.find(function(v){ return v.lang === 'en-US'; })
             || voices[0];
  if (chosen) {
    var opt = document.createElement('option');
    opt.value = chosen.name;
    opt.textContent = chosen.name;
    sel.appendChild(opt);
    sel.value     = chosen.name;
    selectedVoice = chosen;
  }
}

function saveVoice() {
  var sel = document.getElementById('voiceSelect');
  selectedVoice = window.speechSynthesis
    ? window.speechSynthesis.getVoices().find(function(v){ return v.name === sel.value; }) || null
    : null;
  try { localStorage.setItem('rg_voice', sel.value); } catch(e) {}
}

function getVoice() {
  var sel  = document.getElementById('voiceSelect');
  var name = sel ? sel.value : '';
  return window.speechSynthesis
    ? window.speechSynthesis.getVoices().find(function(v){ return v.name === name; }) || null
    : null;
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = populateVoices;
  populateVoices();
}

// ─────────────────────────────────────────────────────────
