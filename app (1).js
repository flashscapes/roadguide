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
  // Toggle events pane vs landmark view
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
    if (c === 'museum')     return /museum|science|planetarium|aquarium|space|zoo|observatory/.test(cat);
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
// SORT & RENDER — called every time GPS updates or filter changes
// ─────────────────────────────────────────────────────────
function sortAndRender() {
  var base = getFiltered();

  if (userLat !== null) {
    // Attach distance + bearing then sort ascending by distance
    sorted = base.map(function(lm) {
      return Object.assign({}, lm, {
        dist: haversine(userLat, userLon, lm.lat, lm.lon),
        dir:  bearing(userLat, userLon, lm.lat, lm.lon)
      });
    });
    sorted.sort(function(a, b) { return a.dist - b.dist; });

    // Scan bar fill: inverse of nearest distance (100% = right on top of it)
    var nearest = sorted[0] ? sorted[0].dist : 99;
    document.getElementById('scanfill').style.width =
      Math.min(100, Math.round(100 / (nearest + 1))) + '%';

    // "Nearby" count = within 5 miles
    var nearby = sorted.filter(function(l) { return l.dist < 5; }).length;
    document.getElementById('dc').textContent = nearby;
    setMsg(sorted.length + ' landmarks · sorted by distance');
  } else {
    // No GPS yet — show unsorted
    sorted = base.slice();
    document.getElementById('dc').textContent = '—';
    setMsg(sorted.length + ' landmarks loaded');
  }

  // Update category count label
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
      + '</div>';
  }
}

// ─────────────────────────────────────────────────────────
// RENDER SCROLLABLE LIST (items 3 and beyond)
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
    var idx = i + 2;   // index into sorted[]
    var distLabel = (lm.dist != null) ? lm.dist.toFixed(1) + ' mi' : '—';
    // Thumbnail: small photo if available, else emoji square
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
// VOICE SELECTION — populate dropdown, prefer natural male voices
// Priority: Google UK English Male > Google US Male > Daniel (Apple)
//           > any male > first available
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// ELEVENLABS CONFIG
// Get a free API key at elevenlabs.io (10,000 chars/month free)
// Paste your key below between the quotes.
// Leave blank ('') to use browser voice only.
// ─────────────────────────────────────────────────────────
var XI_KEY    = '';          // ← paste your ElevenLabs API key here
var XI_VOICE  = 'nPczCjzI2devNBz1zQrb';  // Brian — deep, American, narration
var XI_MODEL  = 'eleven_turbo_v2_5';      // fast, low-latency, English
var xi_audio  = null;        // current Audio object

function xiSpeak(text, onStart, onEnd) {
  if (!XI_KEY) { return false; }  // no key — fall through to browser voice
  // Stop any previous ElevenLabs audio
  if (xi_audio) { xi_audio.pause(); xi_audio = null; }

  var url = 'https://api.elevenlabs.io/v1/text-to-speech/' + XI_VOICE + '/stream';
  fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': XI_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: text,
      model_id: XI_MODEL,
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
    })
  })
  .then(function(r) {
    if (!r.ok) throw new Error('ElevenLabs ' + r.status);
    return r.blob();
  })
  .then(function(blob) {
    var audioUrl = URL.createObjectURL(blob);
    xi_audio = new Audio(audioUrl);
    xi_audio.onplay  = onStart;
    xi_audio.onended = function() { URL.revokeObjectURL(audioUrl); onEnd(); };
    xi_audio.onerror = function() { onEnd(); };
    xi_audio.play();
  })
  .catch(function(err) {
    console.warn('ElevenLabs error, falling back to browser voice:', err);
    browserSpeak(text, onStart, onEnd);
  });
  return true;  // API call initiated
}

function xiStop() {
  if (xi_audio) { xi_audio.pause(); xi_audio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function browserSpeak(text, onStart, onEnd) {
  if (!window.speechSynthesis) { onEnd(); return; }
  var utt  = new SpeechSynthesisUtterance(text);
  utt.lang = 'en-US';   // Let the OS pick its natural US voice — works great on iOS
  utt.rate = 0.92;
  // Only manually assign a voice on non-iOS (iOS ignores voice assignment anyway
  // and sounds better with its own system default via lang alone)
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!isIOS) {
    var v = getVoice(); if (v) utt.voice = v;
  }
  utt.onstart = onStart;
  utt.onend = utt.onerror = onEnd;
  window.speechSynthesis.speak(utt);
}

function isSpeaking() {
  return (xi_audio && !xi_audio.paused) ||
         (window.speechSynthesis && window.speechSynthesis.speaking);
}

var selectedVoice = null;

function populateVoices() {
  var voices = window.speechSynthesis.getVoices();
  if (!voices.length) return;
  var sel = document.getElementById('voiceSelect');
  sel.innerHTML = '';

  // ── Voice priority list ──────────────────────────────────────────────────
  // iOS best males (must be downloaded in Settings > Accessibility > Spoken Content > Voices):
  //   Evan (Enhanced), Nathan (Enhanced) — warm, natural American male
  // Windows Chrome: "Google US English" (lang en-US)
  // macOS/other Chrome: "Google US English Male" or similar
  // Falls back to any en-US voice rather than a non-US voice.
  // ─────────────────────────────────────────────────────────────────────────
  function pickBestVoice(vlist) {
    var n, v;
    // Tier 1 — iOS premium/enhanced male US voices (must be pre-downloaded by user)
    var iosMalePremium = ['evan', 'nathan', 'nolan', 'aaron'];
    for (var i = 0; i < iosMalePremium.length; i++) {
      v = vlist.find(function(v){
        n = v.name.toLowerCase();
        return n === iosMalePremium[i] && v.lang === 'en-US';
      });
      if (v) return v;
    }
    // Tier 2 — Google US English (Windows/Android Chrome exact name)
    v = vlist.find(function(v){ return v.name === 'Google US English'; });
    if (v) return v;
    // Tier 3 — Any Google voice with en-US lang
    v = vlist.find(function(v){
      return v.name.toLowerCase().indexOf('google') !== -1 && v.lang === 'en-US';
    });
    if (v) return v;
    // Tier 4 — Microsoft natural US (Edge/Windows)
    v = vlist.find(function(v){
      return v.name.toLowerCase().indexOf('microsoft') !== -1 && v.lang === 'en-US'
             && v.name.toLowerCase().indexOf('online') !== -1;
    });
    if (v) return v;
    // Tier 5 — Any en-US voice (avoid non-US at all costs)
    v = vlist.find(function(v){ return v.lang === 'en-US'; });
    if (v) return v;
    // Tier 6 — Any English voice
    v = vlist.find(function(v){ return v.lang && v.lang.toLowerCase().indexOf('en') === 0; });
    if (v) return v;
    return vlist[0] || null;
  }

  // Build dropdown — en-US voices first, then everything else
  var sorted_voices = voices.slice().sort(function(a, b) {
    var aScore = (a.lang === 'en-US') ? 1 : 0;
    var bScore = (b.lang === 'en-US') ? 1 : 0;
    return bScore - aScore;
  });

  sorted_voices.forEach(function(v) {
    var opt = document.createElement('option');
    opt.value = v.name;
    opt.textContent = v.name + ' (' + v.lang + ')';
    sel.appendChild(opt);
  });

  // Honour saved preference ONLY if it is en-US — never fall back to a UK/foreign voice
  var saved = localStorage.getItem('rg_voice');
  var savedVoice = saved ? voices.find(function(v){ return v.name === saved; }) : null;
  var chosen = (savedVoice && savedVoice.lang === 'en-US') ? savedVoice : pickBestVoice(voices);
  sel.value = chosen ? chosen.name : '';
  selectedVoice = chosen || null;
}

function saveVoice() {
  var sel = document.getElementById('voiceSelect');
  selectedVoice = window.speechSynthesis.getVoices().find(function(v){ return v.name === sel.value; }) || null;
  try { localStorage.setItem('rg_voice', sel.value); } catch(e) {}
}

function getVoice() {
  // Re-resolve from current voice list in case it changed
  var sel = document.getElementById('voiceSelect');
  var name = sel ? sel.value : '';
  return window.speechSynthesis.getVoices().find(function(v){ return v.name === name; }) || null;
}

// Voices load asynchronously on many browsers
if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = populateVoices;
  populateVoices(); // also try immediately
}

// ─────────────────────────────────────────────────────────
// TOP LISTEN BUTTON — narrates the #1 nearest landmark
// ─────────────────────────────────────────────────────────
function topListen() {
  var lm  = sorted[0];
  if (!lm) { alert('No landmarks loaded yet.'); return; }
  var btn = document.getElementById('listenBtn');
  var lbl = document.getElementById('listenLabel');
  var sub = document.getElementById('listenSub');

  // Stop if already speaking
  if (isSpeaking()) {
    xiStop();
    btn.classList.remove('speaking');
    lbl.textContent = 'LISTEN';
    sub.textContent = 'Tap to hear nearest landmark';
    return;
  }

  var text = lm.name + '. ' + stripTags(lm.fact);

  var onStart = function() {
    btn.classList.add('speaking');
    lbl.textContent = 'STOP';
    sub.textContent = lm.name.toUpperCase().substring(0, 28);
  };
  var onEnd = function() {
    btn.classList.remove('speaking');
    lbl.textContent = 'LISTEN';
    sub.textContent = 'Tap to hear nearest landmark';
  };

  // Try ElevenLabs first; if no key, fall back to browser
  if (!xiSpeak(text, onStart, onEnd)) {
    browserSpeak(text, onStart, onEnd);
  }
}

// ─────────────────────────────────────────────────────────
// OVERLAY — opens when a card or list item is tapped
// ─────────────────────────────────────────────────────────
function cardClick(i) {
  if (sorted[i]) openOverlay(i);
}

function openOverlay(idx) {
  var lm = sorted[idx];
  if (!lm) return;
  overlayLandmark = lm;

  // Stop any playing speech
  xiStop();
  resetTopBtn();

  // Image (photo first, emoji fallback)
  var oImg   = document.getElementById('oImg');
  var oEmoji = document.getElementById('oEmoji');
  if (lm.photo) {
    oImg.src             = lm.photo;
    oImg.style.display   = 'block';
    oEmoji.style.display = 'none';
  } else {
    oImg.src             = '';
    oImg.style.display   = 'none';
    oEmoji.style.display = 'flex';
    oEmoji.textContent   = lm.emoji;
  }

  document.getElementById('otag').textContent  = (lm.cat || '').toUpperCase();
  document.getElementById('oname').textContent = lm.name;

  var distHTML = (lm.dist != null)
    ? '<b>' + lm.dist.toFixed(1) + ' miles</b> ' + (lm.dir || '') : '';
  document.getElementById('odist').innerHTML = distHTML + (lm.county ? ' · ' + escHtml(lm.county) : '');
  document.getElementById('ofact').innerHTML = lm.fact;

  // Reset overlay listen button
  var obtn = document.getElementById('olistenBtn');
  obtn.textContent = '🔊 Listen';
  obtn.classList.remove('speaking');

  document.getElementById('overlay').classList.add('open');
}

function closeOverlay(e) {
  // Only close if user tapped the dark backdrop (not the card itself)
  if (e && e.target !== document.getElementById('overlay')) return;
  document.getElementById('overlay').classList.remove('open');
  xiStop();
  document.getElementById('olistenBtn').textContent = '🔊 Listen';
  document.getElementById('olistenBtn').classList.remove('speaking');
  overlayLandmark = null;
}

// ─────────────────────────────────────────────────────────
// OVERLAY LISTEN BUTTON — narrates the open landmark
// ─────────────────────────────────────────────────────────
function overlayListen() {
  if (!overlayLandmark) return;
  var btn = document.getElementById('olistenBtn');

  if (isSpeaking()) {
    xiStop();
    btn.textContent = '🔊 Listen';
    btn.classList.remove('speaking');
    return;
  }

  var text = overlayLandmark.name + '. ' + stripTags(overlayLandmark.fact);

  var onStart = function() {
    btn.textContent = '⏹ Stop';
    btn.classList.add('speaking');
  };
  var onEnd = function() {
    btn.textContent = '🔊 Listen';
    btn.classList.remove('speaking');
  };

  if (!xiSpeak(text, onStart, onEnd)) {
    browserSpeak(text, onStart, onEnd);
  }
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────
function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, '');
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setDot(cls) {
  document.getElementById('dot').className = 'dot ' + cls;
}

function setMsg(msg) {
  document.getElementById('stmsg').textContent = msg;
}

function resetTopBtn() {
  document.getElementById('listenBtn').classList.remove('speaking');
  document.getElementById('listenLabel').textContent = 'LISTEN';
  document.getElementById('listenSub').textContent   = 'Tap to hear nearest landmark';
}

// ─────────────────────────────────────────────────────────
// BOOT — render immediately, then start GPS
// ─────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────
// TICKETMASTER NEARBY EVENTS
// ─────────────────────────────────────────────────────────
function stripTags(html) {
  return (html || '').replace(/<[^>]+>/g, '');
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function setDot(cls) {
  document.getElementById('dot').className = 'dot ' + cls;
}

function setMsg(msg) {
  document.getElementById('stmsg').textContent = msg;
}

function resetTopBtn() {
  document.getElementById('listenBtn').classList.remove('speaking');
  document.getElementById('listenLabel').textContent = 'LISTEN';
  document.getElementById('listenSub').textContent   = 'Tap to hear nearest landmark';
}

// ─────────────────────────────────────────────────────────
// BOOT — render immediately, then start GPS
// ─────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────
// TICKETMASTER NEARBY EVENTS
// ─────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────
// NEARBY EVENTS — Ticketmaster
// ─────────────────────────────────────────────────────────
var TM_KEY    = 'DqVsAFXbOTvz3GAscGsYvPW8Wl6dxpI7';
var tmEvents  = [];
var tmLoaded  = false;
var tmLoading = false;

var TM_MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
var TM_DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function tmDayLabel(dateStr) {
  var p = dateStr.split('-');
  var d = new Date(+p[0], +p[1]-1, +p[2]);
  var now = new Date();
  var t   = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var diff = Math.round((d - t) / 86400000);
  var label = TM_DAYS[d.getDay()].toUpperCase() + '  —  ' + TM_MONTHS[d.getMonth()] + ' ' + d.getDate();
  if (diff === 0) return 'TODAY  —  ' + TM_MONTHS[d.getMonth()] + ' ' + d.getDate();
  if (diff === 1) return 'TOMORROW  —  ' + TM_MONTHS[d.getMonth()] + ' ' + d.getDate();
  return label;
}

function tmFormatHour(timeStr) {
  if (!timeStr) return null;
  var p    = timeStr.split(':');
  var h    = parseInt(p[0], 10);
  var m    = parseInt(p[1], 10);
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12  = h % 12 || 12;
  var disp = m > 0 ? h12 + ':' + String(m).padStart(2,'0') : String(h12);
  return { hour: disp, ampm: ampm };
}

function setEventsMsg(msg) {
  var pane = document.getElementById('eventsPane');
  if (!pane) return;
  pane.innerHTML = '<div class="ev-msg">' + msg + '</div>';
}

function loadEvents() {
  if (tmLoading) return;
  if (tmLoaded)  { renderTMEvents(); return; }
  if (!userLat) {
    setEventsMsg('Waiting for your location…');
    var t = setInterval(function() {
      if (userLat) { clearInterval(t); loadEvents(); }
    }, 1500);
    return;
  }
  tmLoading = true;
  setEventsMsg('Searching for events near you…');

  var now   = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var end   = new Date(start); end.setDate(end.getDate() + 3);
  function pad(n) { return String(n).padStart(2,'0'); }
  function tmDate(d) { return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T00:00:00Z'; }

  var url = 'https://app.ticketmaster.com/discovery/v2/events.json'
          + '?apikey='        + TM_KEY
          + '&latlong='       + userLat + ',' + userLon
          + '&radius=30&unit=miles'
          + '&startDateTime=' + tmDate(start)
          + '&endDateTime='   + tmDate(end)
          + '&size=50&sort=date,asc';

  fetch(url)
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
      tmLoading = false;
      tmLoaded  = true;
      tmEvents  = (data._embedded && data._embedded.events) || [];
      renderTMEvents();
    })
    .catch(function(e) {
      tmLoading = false;
      setEventsMsg('Could not load events — ' + e.message);
    });
}

function renderTMEvents() {
  var pane = document.getElementById('eventsPane');
  if (!pane) return;

  if (!tmEvents.length) {
    setEventsMsg('No events found within 30 miles in the next 3 days.');
    return;
  }

  // Group by date
  var groups = {}, order = [];
  tmEvents.forEach(function(ev) {
    var d = (ev.dates && ev.dates.start && ev.dates.start.localDate) || 'unknown';
    if (!groups[d]) { groups[d] = []; order.push(d); }
    groups[d].push(ev);
  });

  var html = '';
  order.forEach(function(dateStr) {
    html += '<div class="day-header">' + tmDayLabel(dateStr) + '</div>';
    groups[dateStr].forEach(function(ev) {
      var timeStr  = (ev.dates && ev.dates.start && ev.dates.start.localTime) || '';
      var tObj     = timeStr ? tmFormatHour(timeStr) : null;
      var venue    = (ev._embedded && ev._embedded.venues && ev._embedded.venues[0]) || {};
      var venueName = venue.name || '';
      var vLat     = venue.location ? parseFloat(venue.location.latitude)  : null;
      var vLon     = venue.location ? parseFloat(venue.location.longitude) : null;
      var miles    = (userLat && vLat) ? haversine(userLat, userLon, vLat, vLon).toFixed(1) + ' mi' : '';
      var seg      = (ev.classifications && ev.classifications[0] && ev.classifications[0].segment) ? ev.classifications[0].segment.name : '';
      var genre    = (ev.classifications && ev.classifications[0] && ev.classifications[0].genre)   ? ev.classifications[0].genre.name   : '';
      var cat      = (genre && genre !== 'Undefined') ? genre : seg;
      var url      = ev.url || '#';

      var timeHTML = tObj
        ? '<div class="ev-hour">' + tObj.hour + '</div><div class="ev-ampm">' + tObj.ampm + '</div>'
        : '<div class="ev-tbd">TIME<br>TBA</div>';

      html += '<a class="ev-card" href="' + escHtml(url) + '" target="_blank" rel="noopener">'
            + '<div class="ev-time-col">' + timeHTML + '</div>'
            + '<div class="ev-info">'
            + '<div class="ev-name">'  + escHtml(ev.name)   + '</div>'
            + '<div class="ev-venue">' + escHtml(venueName) + '</div>'
            + '<div class="ev-meta">'
            + (cat   ? '<span class="ev-cat">'  + escHtml(cat) + '</span>' : '')
            + (miles ? '<span class="ev-dist">' + miles + '</span>' : '')
            + '</div></div></a>';
    });
  });

  pane.innerHTML = html;
}


sortAndRender();
startGPS();