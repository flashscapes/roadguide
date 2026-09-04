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
    //
    // All 4 radii are tried AT THE SAME TIME, not one after another —
    // checking them sequentially could take up to 4 network round
    // trips back to back, which combined with the AI call risked
    // exceeding Vercel's 10-second limit for this request.
    async function fetchNearby(radius) {
      const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
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
              radius: radius
            }
          },
          maxResultCount: 8,
          rankPreference: "POPULARITY"
        })
      });
      const data = await response.json();
      return data.places || [];
    }

    const radiiToTry = [3000, 10000, 25000, 50000];
    const allResults = await Promise.all(radiiToTry.map(r => fetchNearby(r)));

    let places = [];
    let radiusUsed = radiiToTry[0];
    for (let i = 0; i < radiiToTry.length; i++) {
      if (allResults[i].length >= 3) {
        places = allResults[i];
        radiusUsed = radiiToTry[i];
        break;
      }
    }
    if (!places.length) {
      // None hit the threshold — fall back to whichever radius found the most.
      let bestIndex = 0;
      for (let i = 1; i < allResults.length; i++) {
        if (allResults[i].length > allResults[bestIndex].length) bestIndex = i;
      }
      places = allResults[bestIndex];
      radiusUsed = radiiToTry[bestIndex];
    }

    const context = places
      .map(p => {
        const name = p.displayName && p.displayName.text;
        return name && p.formattedAddress ? `${name} — ${p.formattedAddress}` : name;
      })
      .filter(Boolean)
      .join("; ");

    const locationLine = context || `latitude ${lat}, longitude ${lng}`;
    const wideSearch = radiusUsed > 3000;

    // Step 2: ask a free, fast model for a short, spoken-style answer.
    // "I don't know" is treated as a last resort, not an easy out —
    // if the immediate spot is thin on detail, it should zoom out to
    // the neighborhood, city, or region rather than giving up.
    const prompt =
      "You are a knowledgeable local tour guide speaking out loud to someone " +
      "standing at this exact spot right now. Nearby points of reference" +
      (wideSearch ? " (search was widened to " + Math.round(radiusUsed / 1000) + "km because the immediate area was sparse)" : "") +
      ": " + locationLine + ". " +
      "Give a short, genuinely interesting piece of local history, culture, or " +
      "trivia — 2 to 4 sentences, natural spoken style, no headers or bullet " +
      "points. If you don't know something specific about the exact block, " +
      "zoom out and share something real and interesting about the " +
      "neighborhood, city, county, or region instead — do not simply say you " +
      "don't know or apologize for lacking information. Only say you have " +
      "nothing at all if you genuinely cannot place even the city or region " +
      "from the reference points given. Stick to well-known, broadly " +
      "verifiable facts — do not invent specific names, dates, or details " +
      "you are not confident about.";

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + groqKey
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 500,
        reasoning_effort: "low",
        temperature: 0.6
      })
    });
    const groqData = await groqResponse.json();

    if (!groqResponse.ok) {
      // The request reached Groq fine, but Groq itself rejected it
      // (bad/expired key, retired model, rate limit, etc). Surface the
      // real reason instead of pretending nothing was found.
      const reason = (groqData.error && groqData.error.message) || "Groq returned an unspecified error.";
      console.error("Groq API error:", reason);
      return res.status(502).json({ error: "Groq request failed: " + reason });
    }

    const story = groqData.choices
      && groqData.choices[0]
      && groqData.choices[0].message
      && groqData.choices[0].message.content;

    if (!story) {
      console.warn(
        "Groq returned no story text. finish_reason:",
        groqData.choices && groqData.choices[0] && groqData.choices[0].finish_reason
      );
    }

    // Hard safety cap: even though the prompt asks for 2-4 sentences,
    // language models occasionally ignore length instructions. A much
    // longer response takes noticeably longer to turn into speech,
    // which risks failing silently downstream — and it's also just a
    // worse experience (a rambling monologue instead of a quick fact).
    // Trimmed at the last sentence boundary before the cap, not just
    // chopped mid-word.
    function trimToSentence(text, maxLength) {
      if (text.length <= maxLength) return text;
      const cut = text.slice(0, maxLength);
      const lastEnd = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
      if (lastEnd > maxLength * 0.4) return cut.slice(0, lastEnd + 1);
      return cut.trim() + '.';
    }

    const rawStory = story ? story.trim() : "I couldn't come up with anything for this area right now.";
    const finalStory = trimToSentence(rawStory, 500);

    return res.status(200).json({
      story: finalStory,
      nearLabel: (places[0] && places[0].displayName && places[0].displayName.text) || null,
      radiusUsedMeters: radiusUsed
    });
  } catch (error) {
    console.error("Story lookup error:", error);
    return res.status(500).json({ error: "Story lookup failed.", details: error.message });
  }
}
