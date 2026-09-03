import { EdgeTTS } from 'edge-tts-universal';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.query;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "text is required." });
  }

  try {
    // en-US-EmmaMultilingualNeural is one of Microsoft's natural-sounding
    // neural voices — the same tier Edge's browser "Read Aloud" feature
    // uses. No account, no API key: this talks directly to the same
    // free service Edge itself uses.
    const tts = new EdgeTTS(text, 'en-US-EmmaMultilingualNeural');
    const result = await tts.synthesize();
    const audioBuffer = Buffer.from(await result.audio.arrayBuffer());

    res.setHeader('Content-Type', 'audio/mpeg');
    return res.status(200).send(audioBuffer);
  } catch (error) {
    console.error("Speech synthesis error:", error);
    return res.status(500).json({ error: "Speech synthesis failed.", details: error.message });
  }
}
