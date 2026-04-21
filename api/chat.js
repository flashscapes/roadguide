
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, landmarkName } = req.body;
  if (!messages || !landmarkName) {
    return res.status(400).json({ error: 'Missing messages or landmarkName' });
  }
