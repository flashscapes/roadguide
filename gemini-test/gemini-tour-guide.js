// ============================================================
//  GEMINI LIVING TOUR GUIDE  —  gemini-tour-guide.js
//
//  Flow:
//  1. User taps Listen → Gemini speaks the landmark fact
//  2. Gemini bridges naturally to surroundings / history
//  3. Dead air → filler kicks in (landscape, geology, folklore)
//  4. Next landmark approaches → seamless handoff
//  5. All speech streams token-by-token, starts instantly
// ============================================================

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent";

const FILL_INTERVAL_MS     = 40000; // filler after 40s of silence
const MOVEMENT_THRESHOLD_M = 150;   // meters before "pickup" check
const NEAR_LANDMARK_METERS = 800;   // distance = "approaching"

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export class GeminiTourGuide {
  constructor(opts = {}) {
    this.apiKey         = opts.apiKey;
    this.onToken        = opts.onToken        || (() => {});
    this.onSpeakStart   = opts.onSpeakStart   || (() => {});
    this.onSpeakEnd     = opts.onSpeakEnd     || (() => {});
    this.onStatusChange = opts.onStatusChange || (() => {});
    this.onError        = opts.onError        || console.error;
    this.allLandmarks   = opts.allLandmarks   || [];

    this._active             = false;
    this._speaking           = false;
    this._currentLandmark    = null;
    this._lastSpokenLandmark = null;
    this._lastPosition       = null;
    this._currentCoords      = null;
    this._currentSpeed       = null;
    this._fillTimer          = null;
    this._conversationLog    = [];
    this._speechQueue        = [];
    this._speechBuffer       = "";
    this._isSpeaking         = false;
    this._geoWatchId         = null;
    this._abortController    = null;
    this._selectedVoice      = null;

    this._initVoices();
  }

  _initVoices() {
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      this._selectedVoice =
        voices.find(v => /samantha|karen|daniel|moira/i.test(v.name)) ||
        voices.find(v => v.lang === "en-US" && v.localService) ||
        voices.find(v => v.lang.startsWith("en")) || null;
    };
    if (window.speechSynthesis) {
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  setApiKey(key) { this.apiKey = key; }

  // ── PUBLIC: Start tour on a landmark ─────────────────────
  async startLandmark(landmark) {
    this._active          = true;
    this._currentLandmark = landmark;
    this._conversationLog = [];
    this._startGPS();
    this._scheduleFill();
    this.onStatusChange("narrating");
    await this._streamFromGemini(this._buildLandmarkPrompt(landmark));
    this._lastSpokenLandmark = landmark;
  }

  // ── PUBLIC: Stop everything ───────────────────────────────
  stop() {
    this._active = false;
    this._stopSpeech();
    this._stopGPS();
    clearTimeout(this._fillTimer);
    if (this._abortController) this._abortController.abort();
    this.onStatusChange("idle");
  }

  // ── PUBLIC: "Tell me more" ────────────────────────────────
  async continueNarration() {
    if (!this._active) return;
    await this._streamFromGemini(this._buildContinuePrompt());
  }

  // ── PUBLIC: Seamless handoff to next landmark ─────────────
  async handoffToLandmark(landmark) {
    if (!this._active) return;
    this._currentLandmark = landmark;
    clearTimeout(this._fillTimer);
    this._scheduleFill();
    await this._streamFromGemini(this._buildHandoffPrompt(landmark));
    this._lastSpokenLandmark = landmark;
  }

  // ── GPS ───────────────────────────────────────────────────
  _startGPS() {
    if (!navigator.geolocation) return;
    this._geoWatchId = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon, speed } = pos.coords;
        this._currentCoords = { lat, lon };
        this._currentSpeed  = speed;

        if (this._lastPosition) {
          const dist = haversineMeters(
            this._lastPosition.lat, this._lastPosition.lon, lat, lon
          );
          if (dist > MOVEMENT_THRESHOLD_M) {
            this._lastPosition = { lat, lon };
            this._checkUpcomingLandmarks(lat, lon);
          }
        } else {
          this._lastPosition = { lat, lon };
        }
      },
      err => console.warn("GPS:", err),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  }

  _stopGPS() {
    if (this._geoWatchId !== null) {
      navigator.geolocation.clearWatch(this._geoWatchId);
      this._geoWatchId = null;
    }
  }

  _checkUpcomingLandmarks(lat, lon) {
    if (!this.allLandmarks.length || this._speaking) return;
    const nearby = this.allLandmarks
      .map(lm => ({ ...lm, dist: haversineMeters(lat, lon, lm.lat, lm.lon) }))
      .filter(lm => lm.dist < NEAR_LANDMARK_METERS)
      .sort((a, b) => a.dist - b.dist);
    const next = nearby[0];
    if (!next) return;
    if (this._lastSpokenLandmark?.name === next.name) return;
    this.handoffToLandmark(next);
  }

  // ── Fill narration ────────────────────────────────────────
  _scheduleFill() {
    clearTimeout(this._fillTimer);
    this._fillTimer = setTimeout(async () => {
      if (!this._active) return;
      if (!this._speaking) {
        this.onStatusChange("filling");
        await this._streamFromGemini(this._buildFillPrompt());
      }
      this._scheduleFill();
    }, FILL_INTERVAL_MS);
  }

  // ── Prompt builders ───────────────────────────────────────
  _systemInstruction() {
    return `You are a warm, knowledgeable California road-trip guide — like a local friend riding shotgun.

Your ONLY job is to keep the conversation moving. You NEVER go silent.

Rules:
- Start with the landmark fact (2-3 sentences).
- Then BRIDGE naturally to the surrounding area, local history, geology, folklore, or what is coming next.
- End EVERY response with a soft lead-in that teases what is ahead. Examples: "As we keep heading north..." / "Just around the bend from here..." / "Speaking of which, keep an eye on the hillside to your left..."
- Speak conversationally in second person: "you are passing...", "you can see..."
- If there is nothing specific, talk beautifully about the light, the landscape, or the season.
- 3-5 sentences per response. Short and flowing, not lecture-style.
- No bullet points. No "In conclusion." Always leave it open.
- You are a radio that never turns off.`;
  }

  _locationContext() {
    if (!this._currentCoords) return "";
    const spd = this._currentSpeed != null
      ? ` travelling at approximately ${(this._currentSpeed * 2.237).toFixed(0)} mph` : "";
    return `The driver is at lat ${this._currentCoords.lat.toFixed(4)}, lon ${this._currentCoords.lon.toFixed(4)}${spd}.`;
  }

  _buildLandmarkPrompt(lm) {
    const fact = (lm.fact || "").replace(/<[^>]+>/g, "");
    const msg =
      `The driver just tapped Listen on this landmark:\n` +
      `Name: ${lm.name}\n` +
      `County: ${lm.county || ""}\n` +
      `Category: ${lm.cat || "General"}\n` +
      `Fact: ${fact}\n` +
      `${this._locationContext()}\n\n` +
      `Start your narration about ${lm.name}. Cover the fact first (2-3 sentences), ` +
      `then bridge naturally to the surrounding area and what is ahead. ` +
      `End with a line that leads into what is coming next on the drive.`;
    this._conversationLog.push({ role: "user", parts: [{ text: msg }] });
    return msg;
  }

  _buildHandoffPrompt(lm) {
    const fact = (lm.fact || "").replace(/<[^>]+>/g, "");
    const msg =
      `The driver is now approaching a new landmark:\n` +
      `Name: ${lm.name}\n` +
      `County: ${lm.county || ""}\n` +
      `Category: ${lm.cat || "General"}\n` +
      `Fact: ${fact}\n` +
      `${this._locationContext()}\n\n` +
      `Do NOT start fresh. Seamlessly transition from what you were just talking about ` +
      `into ${lm.name}. Make it feel like one continuous journey, not a new chapter.`;
    this._conversationLog.push({ role: "user", parts: [{ text: msg }] });
    return msg;
  }

  _buildFillPrompt() {
    const msg =
      `${this._locationContext()}\n\n` +
      `It has been quiet for a moment on the drive. Jump back in naturally from where ` +
      `you left off. Tell the driver something interesting about the landscape, terrain, ` +
      `local culture, or history of this part of California. ` +
      `Keep it short and warm, and end with a lead-in to what might be ahead.`;
    this._conversationLog.push({ role: "user", parts: [{ text: msg }] });
    return msg;
  }

  _buildContinuePrompt() {
    const msg =
      `${this._locationContext()}\n\n` +
      `Keep the tour going. Pick up from where you left off — cover more about the ` +
      `surrounding area, what is coming up on this route, or an interesting local story. ` +
      `Do not repeat anything already said.`;
    this._conversationLog.push({ role: "user", parts: [{ text: msg }] });
    return msg;
  }

  // ── Stream from Gemini ────────────────────────────────────
  async _streamFromGemini(userMessage) {
    if (!this.apiKey) {
      this.onError("No Gemini API key. Call guide.setApiKey('YOUR_KEY') first.");
      return;
    }

    this._abortController = new AbortController();

    const payload = {
      system_instruction: { parts: [{ text: this._systemInstruction() }] },
      contents: this._conversationLog,
      generationConfig: { temperature: 0.85, maxOutputTokens: 350 },
    };

    let fullResponse = "";

    try {
      const res = await fetch(`${GEMINI_API_URL}?key=${this.apiKey}&alt=sse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: this._abortController.signal,
      });

      if (!res.ok) {
        this.onError(`Gemini API error ${res.status}: ${await res.text()}`);
        return;
      }

      this._speaking = true;
      this.onSpeakStart();

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const chunk = JSON.parse(jsonStr);
            const token = chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (token) {
              fullResponse += token;
              this.onToken(token);
              this._queueSpeech(token);
            }
          } catch (_) {}
        }
      }

      // Flush remaining partial sentence
      if (this._speechBuffer?.trim()) {
        this._speechQueue.push(this._speechBuffer.trim());
        this._speechBuffer = "";
        this._drainSpeechQueue();
      }

      if (fullResponse) {
        this._conversationLog.push({ role: "model", parts: [{ text: fullResponse }] });
        if (this._conversationLog.length > 20) {
          this._conversationLog = this._conversationLog.slice(-20);
        }
      }

    } catch (err) {
      if (err.name !== "AbortError") this.onError(err);
    } finally {
      this._speaking = false;
      this.onSpeakEnd();
      this.onStatusChange("bridging");
    }
  }

  // ── TTS queue — sentences stream in real-time ─────────────
  _queueSpeech(token) {
    if (!window.speechSynthesis) return;
    this._speechBuffer = (this._speechBuffer || "") + token;
    const re = /([.!?])\s+/g;
    let match, lastIndex = 0;
    while ((match = re.exec(this._speechBuffer)) !== null) {
      const s = this._speechBuffer.slice(lastIndex, match.index + 1).trim();
      if (s.length > 3) this._speechQueue.push(s);
      lastIndex = match.index + match[0].length;
    }
    this._speechBuffer = this._speechBuffer.slice(lastIndex);
    this._drainSpeechQueue();
  }

  _drainSpeechQueue() {
    if (this._isSpeaking || !this._speechQueue.length || !window.speechSynthesis) return;
    const sentence = this._speechQueue.shift();
    const utt = new SpeechSynthesisUtterance(sentence);
    utt.rate = 0.90; utt.pitch = 1.0; utt.volume = 1.0;
    if (this._selectedVoice) utt.voice = this._selectedVoice;
    utt.onstart = () => { this._isSpeaking = true; };
    utt.onend   = () => { this._isSpeaking = false; this._drainSpeechQueue(); };
    utt.onerror = () => { this._isSpeaking = false; this._drainSpeechQueue(); };
    window.speechSynthesis.speak(utt);
  }

  _stopSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    this._speechQueue  = [];
    this._speechBuffer = "";
    this._isSpeaking   = false;
  }
}
