Here it is — select all and copy:
javascript// ─────────────────────────────────────────────────────────
// TOP LISTEN BUTTON
// ─────────────────────────────────────────────────────────
function topListen() {
  var lm  = sorted[0];
  if (!lm) { alert('No landmarks loaded yet.'); return; }
  var btn = document.getElementById('listenBtn');
  var lbl = document.getElementById('listenLabel');
  var sub = document.getElementById('listenSub');

  if (isSpeaking()) {
    xiStop();
    btn.classList.remove('speaking');
    lbl.textContent = 'LISTEN';
    sub.textContent = 'Tap to hear nearest landmark';
    return;
  }

  lbl.textContent = 'LOADING...';
  sub.textContent = 'Preparing audio';
  btn.classList.add('speaking');

  var full = stripTags(lm.fact);
  var sentences = full.match(/[^.!?]+[.!?]+/g) || [full];
  var short = sentences.slice(0, 2).join(' ').trim();
  var text = lm.name + '. ' + short;

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

  browserSpeak(text, onStart, onEnd);
}

// ─────────────────────────────────────────────────────────
// OVERLAY
// ─────────────────────────────────────────────────────────
function cardClick(i) {
  if (sorted[i]) openOverlay(i);
}

function openOverlay(idx) {
  var lm = sorted[idx];
  if (!lm) return;
  overlayLandmark = lm;

  xiStop();
  resetTopBtn();

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
  document.getElementById('ofact').innerHTML = lm.fact
    + '<a class="yt-link" href="https://www.youtube.com/results?search_query='
    + encodeURIComponent(lm.name)
    + '" target="_blank" rel="noopener">&#9654; Watch on YouTube</a>';

  var obtn = document.getElementById('olistenBtn');
  obtn.textContent = '🔊 Listen';
  obtn.classList.remove('speaking');

  document.getElementById('overlay').classList.add('open');
}

function closeOverlay(e) {
  if (e && e.target !== document.getElementById('overlay')) return;
  document.getElementById('overlay').classList.remove('open');
  xiStop();
  document.getElementById('olistenBtn').textContent = '🔊 Listen';
  document.getElementById('olistenBtn').classList.remove('speaking');
  overlayLandmark = null;
}

// ─────────────────────────────────────────────────────────
// OVERLAY LISTEN BUTTON
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

  var full = stripTags(overlayLandmark.fact);
  var sentences = full.match(/[^.!?]+[.!?]+/g) || [full];
  var short = sentences.slice(0, 2).join(' ').trim();
  var text = overlayLandmark.name + '. ' + short;

  var onStart = function() {
    btn.textContent = '⏹ Stop';
    btn.classList.add('speaking');
  };
  var onEnd = function() {
    btn.textContent = '🔊 Listen';
    btn.classList.remove('speaking');
  };

  browserSpeak(text, onStart, onEnd);
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
// TICKETMASTER NEARBY EVENTS
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
  if (diff === 1) return 'TOMORROW  —  ' + TM_MONTHS[d.getMonth()] + ' ' + d.getDate();
  return TM_DAYS[d.getDay()].toUpperCase() + '  —  ' + TM_MONTHS[d.getMonth()] + ' ' + d.getDate();
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
  setEventsMsg('Searching for upcoming events near you…');

  var now   = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14);

  function pad(n) { return String(n).padStart(2,'0'); }
  function tmDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) + 'T00:00:00Z';
  }

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
    setEventsMsg('No events found within 30 miles in the next 2 weeks.');
    return;
  }

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
      var timeStr   = (ev.dates && ev.dates.start && ev.dates.start.localTime) || '';
      var tObj      = timeStr ? tmFormatHour(timeStr) : null;
      var venue     = (ev._embedded && ev._embedded.venues && ev._embedded.venues[0]) || {};
      var venueName = venue.name || '';
      var vLat      = venue.location ? parseFloat(venue.location.latitude)  : null;
      var vLon      = venue.location ? parseFloat(venue.location.longitude) : null;
      var miles     = (userLat && vLat) ? haversine(userLat, userLon, vLat, vLon).toFixed(1) + ' mi' : '';
      var seg       = (ev.classifications && ev.classifications[0] && ev.classifications[0].segment) ? ev.classifications[0].segment.name : '';
      var genre     = (ev.classifications && ev.classifications[0] && ev.classifications[0].genre)   ? ev.classifications[0].genre.name   : '';
      var cat       = (genre && genre !== 'Undefined') ? genre : seg;
      var evUrl     = ev.url || '#';

      var timeHTML = tObj
        ? '<div class="ev-hour">' + tObj.hour + '</div><div class="ev-ampm">' + tObj.ampm + '</div>'
        : '<div class="ev-tbd">TIME<br>TBA</div>';

      html += '<a class="ev-card" href="' + escHtml(evUrl) + '" target="_blank" rel="noopener">'
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

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────
sortAndRender();
startGPS();
