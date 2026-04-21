export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, landmarkName } = req.body;
  if (!messages || !landmarkName) {
    return res.status(400).json({ error: 'Missing messages or landmarkName' });
  }

  const systemPrompt = {
    role: 'system',
    content: `You are a knowledgeable and engaging California road guide. The user is currently at or near ${landmarkName}. Respond in exactly 2-3 sentences. Be fascinating, specific, and conversational — like a brilliant friend who knows everything about this place. Never say "certainly", "great question", or "absolutely". Never mention you are an AI.`
  };

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      max_tokens: 150,
      messages: [systemPrompt, ...messages]
    })
  });

  if (!response.ok) {
    return res.status(500).json({ error: 'AI request failed' });
  }

  const data = await response.json();
  const text = data.choices[0].message.content.trim();
  res.json({ text });
}
