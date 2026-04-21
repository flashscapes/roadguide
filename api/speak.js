
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'tts-1-hd',
      voice: 'fable',
      input: text
    })
  });

  if (!response.ok) {
    return res.status(500).json({ error: 'TTS failed' });
  }

  const audioBuffer = await response.arrayBuffer();
  res.setHeader('Content-Type', 'audio/mpeg');
  res.send(Buffer.from(audioBuffer));
}
