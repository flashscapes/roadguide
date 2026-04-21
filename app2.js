
// ─────────────────────────────────────────────────────────
// AI CHAT PANEL
// ─────────────────────────────────────────────────────────
var aiHistory = [];
var aiLandmark = null;
var aiSpeaking = false;

function openAI() {
  if (!overlayLandmark) return;
  aiLandmark = overlayLandmark;
  aiHistory = [];

  var panel = document.getElementById('aiPanel');
  var msgs  = document.getElementById('aiMessages');
  var label = document.getElementById('askAiLabel');
  var name  = document.getElementById('aiPanelName');

  name.textContent = aiLandmark.name.toUpperCase();
  msgs.innerHTML = '';
  panel.classList.add('open');

  label.textContent = 'LOADING...';

  var opening = 'Tell me the most fascinating thing about ' + aiLandmark.name + '.';
  callAI(opening, true);
}

function closeAI() {
  document.getElementById('aiPanel').classList.remove('open');
  document.getElementById('askAiLabel').textContent = 'ASK AI';
  xiStop();
  aiHistory = [];
  aiLandmark = null;
}

function sendAI() {
  var input = document.getElementById('aiInput');
  var text  = input.value.trim();
  if (!text) return;
  input.value = '';
  callAI(text, false);
}

function callAI(userText, isOpening) {
  var msgs  = document.getElementById('aiMessages');
  var label = document.getElementById('askAiLabel');

  if (!isOpening) {
    var userDiv = document.createElement('div');
    userDiv.className = 'ai-msg user';
    userDiv.textContent = userText;
    msgs.appendChild(userDiv);
  }

  var loadDiv = document.createElement('div');
  loadDiv.className = 'ai-msg ai loading';
  loadDiv.textContent = 'Thinking...';
  msgs.appendChild(loadDiv);
  msgs.scrollTop = msgs.scrollHeight;

  aiHistory.push({ role: 'user', content: userText });

  document.getElementById('aiInput').disabled = true;
  document.getElementById('aiSend').disabled  = true;

  // Open ChatGPT as fallback since no server backend is available
  msgs.removeChild(loadDiv);
  label.textContent = 'ASK AI';
  document.getElementById('aiInput').disabled = false;
  document.getElementById('aiSend').disabled  = false;

  var errDiv = document.createElement('div');
  errDiv.className = 'ai-msg ai';
  errDiv.textContent = 'Tap the ChatGPT button below to ask about this landmark.';
  msgs.appendChild(errDiv);
}

function speakAI(text, onDone) {
  browserSpeak(text, null, onDone);
}

// ─────────────────────────────────────────────────────────
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

// ─────────────────────────────
