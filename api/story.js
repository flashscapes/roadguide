export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://flashscapes.github.io');

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;
  if (!placesKey) {
    return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY is not configured." });
  }
  if (!groqKey) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured." });
  }

  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ error: "lat and lng are required." });
  }

  try {
    // Step 1: figure out roughly where this is. Uses the same Places
    // API (New) product already used everywhere else in this app
    // (landmarks.js, restaurants.js) — no separate Geocoding API or
    // additional Google Cloud Console setup needed.
    const nearbyResponse = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": placesKey,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress"
      },
      body: JSON.stringify({
        locationRestriction: {
          circle: {
            center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
            radius: 3000
          }
        },
        maxResultCount: 5,
        rankPreference: "POPULARITY"
      })
    });
    const nearbyData = await nearbyResponse.json();
    const places = nearbyData.places || [];

    const context = places
      .map(p => {
        const name = p.displayName && p.displayName.text;
        return name && p.formattedAddress ? `${name} — ${p.formattedAddress}` : name;
      })
      .filter(Boolean)
      .join("; ");

    const locationLine = context || `latitude ${lat}, longitude ${lng}`;

    // Step 2: ask a free, fast model for a short, spoken-style answer.
    const prompt =
      "You are a knowledgeable local tour guide speaking out loud to someone " +
      "standing at this exact spot right now, near: " + locationLine + ". " +
      "Give a short, specific, genuinely interesting piece of local history or " +
      "trivia about this immediate area — 2 to 4 sentences, in a natural spoken " +
      "style, no headers or bullet points. If you don't have anything specific " +
      "and reliable about this exact spot, say so briefly and then share " +
      "whatever you do know about the broader area instead. Do not invent " +
      "specific facts, dates, or names you are not confident about.";

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + groqKey
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 220,
        temperature: 0.6
      })
    });
    const groqData = await groqResponse.json();
    const story = groqData.choices
      && groqData.choices[0]
      && groqData.choices[0].message
      && groqData.choices[0].message.content;

    return res.status(200).json({
      story: story ? story.trim() : "I couldn't come up with anything for this exact spot right now.",
      nearLabel: (places[0] && places[0].displayName && places[0].displayName.text) || null
    });
  } catch (error) {
    console.error("Story lookup error:", error);
    return res.status(500).json({ error: "Story lookup failed.", details: error.message });
  }
}
