export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { landmark } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `You are an expert tour guide. The user is looking at ${landmark}. Tell them a fascinating, deep-dive story or fact about this location that they wouldn't find in a basic brochure. Keep it engaging.` }] }]
      })
    });
    const data = await response.json();
    const aiText = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ text: aiText });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to talk to Gemini' });
  }
}
