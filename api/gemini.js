export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { landmark, history } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const contents = history && history.length > 0 ? history : [
      { parts: [{ text: `You are an enthusiastic expert tour guide. The user is standing near ${landmark}. Give a brief, fascinating 2-3 sentence intro about this location, then ask: "What would you like to know more about?" Keep it conversational and spoken-word friendly — no bullet points or markdown.` }], role: 'user' }
    ];

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents })
    });

    const data = await response.json();
    const aiText = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ text: aiText });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to talk to Gemini' });
  }
}
