function xiSpeak(text, onStart, onEnd) {
  xiStop();
  if (onStart) onStart();
  fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text })
  })
  .then(function(r) { return r.blob(); })
  .then(function(blob) {
    var url = URL.createObjectURL(blob);
    var audio = new Audio(url);
    _speaking = true;
    audio.onended = function() {
      _speaking = false;
      URL.revokeObjectURL(url);
      if (onEnd) onEnd();
    };
    audio.onerror = function() {
      _speaking = false;
      if (onEnd) onEnd();
      browserSpeak(text, null, onEnd);
    };
    audio.play();
  })
  .catch(function() {
    browserSpeak(text, null, onEnd);
  });
  return true;
}
