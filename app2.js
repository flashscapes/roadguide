// TOP LISTEN BUTTON — narrates the #1 nearest landmark
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
// TICKETMASTER NEARBY EVENTS
// Shows events starting TOMORROW through the following 3 days
// Never shows today's events
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
  setEventsMsg('Searching for upcoming events near you…');

  var now   = new Date();

  // Start = tomorrow (never today)
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  // End = 3 days after tomorrow
  var end   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4);

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
    setEventsMsg('No events found within 30 miles in the next 3 days.');
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

// ─────────────────────────────────────────────────────────
// EVENTS — self-install CSS, chip, and pane into the page
// ─────────────────────────────────────────────────────────
(function installEvents() {
  var style = document.createElement('style');
  style.textContent = [
    '#eventsPane{display:none;flex-direction:column;gap:0;margin-bottom:14px;}',
    '#eventsPane.active{display:flex;}',
    '.day-header{font-family:"Bebas Neue",sans-serif;font-size:13px;letter-spacing:4px;color:var(--gold);padding:14px 2px 8px;border-bottom:1px solid rgba(201,168,76,.15);margin-bottom:10px;}',
    '.ev-card{display:flex;gap:0;background:var(--card);border:1px solid var(--edge);border-radius:14px;margin-bottom:9px;overflow:hidden;text-decoration:none;color:inherit;transition:border-color .2s;}',
    '.ev-card:active{border-color:rgba(201,168,76,.4);}',
    '.ev-time-col{display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;width:58px;padding:14px 8px;background:rgba(201,168,76,.06);border-right:1px solid rgba(255,255,255,.07);}',
    '.ev-hour{font-family:"Bebas Neue",sans-serif;font-size:22px;letter-spacing:1px;color:var(--glo);line-height:1;}',
    '.ev-ampm{font-family:"DM Mono",monospace;font-size:8px;letter-spacing:2px;color:var(--gold);margin-top:2px;}',
    '.ev-tbd{font-family:"DM Mono",monospace;font-size:8px;letter-spacing:1px;color:var(--dim);text-align:center;line-height:1.4;}',
    '.ev-info{flex:1;min-width:0;padding:12px 13px;}',
    '.ev-name{font-family:"Bebas Neue",sans-serif;font-size:16px;letter-spacing:.5px;color:var(--pale);line-height:1.15;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.ev-venue{font-size:11px;font-weight:400;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:5px;}',
    '.ev-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
    '.ev-cat{font-family:"DM Mono",monospace;font-size:8px;letter-spacing:1px;color:rgba(201,168,76,.7);text-transform:uppercase;background:rgba(201,168,76,.08);border-radius:4px;padding:2px 6px;}',
    '.ev-dist{font-family:"DM Mono",monospace;font-size:9px;color:var(--green);margin-left:auto;flex-shrink:0;}',
    '.ev-msg{font-family:"DM Mono",monospace;font-size:10px;color:var(--dim);padding:24px 0;text-align:center;letter-spacing:.5px;}'
  ].join('');
  document.head.appendChild(style);

  var gpsBar = document.getElementById('gpsBar');
  if (gpsBar) {
    var pane = document.createElement('div');
    pane.id = 'eventsPane';
    pane.innerHTML = "<div class=\"ev-msg\">Tap Events to see what's coming up nearby</div>";
    gpsBar.parentNode.insertBefore(pane, gpsBar);
  }
})();

sortAndRender();
startGPS();
