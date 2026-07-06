// Serverless function (Vercel/Netlify compatible) that calls the Anthropic API.
// The API key lives ONLY here, in the server environment, never in the browser.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. Set it in your host's environment variables." });
    return;
  }

  // Vercel parses JSON bodies automatically; guard for other hosts.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const fixedActivities = (body && body.fixedActivities) || "none";
  const context = (body && body.context) || "none";

  const prompt = [
    "You are a fitness coach. Create a weekly workout plan for a 37-year-old male who wants to build muscle, lose fat, and improve at basketball and tennis. He does reformer Pilates weekly and contrast therapy (sauna and cold plunge) on Sundays.",
    "Fixed activities this week: " + fixedActivities,
    "Additional context: " + context,
    "Rules: 4 lifting sessions per week using an upper/lower split with both strength and hypertrophy days. Keep every session under 60 minutes. Do not stack heavy lifting on the same day as intense sport. Include power work such as box jumps or broad jumps on lower-body days. Include shoulder prehab such as face pulls on upper-body days. Apply progressive overload and state in each exercise's notes when to add weight.",
    "The week is Monday-anchored: include all seven days Monday through Sunday.",
    "Respond ONLY with valid JSON, no markdown and no backticks. The shape is: a top-level \"days\" object whose keys are Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday. Each day is an object with: title (string), type (one of: lift, sport, recovery, class, other), duration (string, may be empty), and sections (array; may be empty for rest, sport, class, or recovery days). Each section has name (string) and exercises (array). Each exercise has name (string), sets (string), reps (string), and notes (string, may be empty)."
  ].join(" ");

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      const msg = (data && data.error && data.error.message) || ("Anthropic API returned status " + anthropicRes.status);
      res.status(502).json({ error: msg });
      return;
    }

    const text = (data.content || [])
      .map(b => (b && b.type === "text" ? b.text : ""))
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    let plan;
    try {
      plan = JSON.parse(text);
    } catch (_) {
      res.status(502).json({ error: "Claude did not return valid JSON. Raw start: " + text.slice(0, 200) });
      return;
    }

    if (!plan || !plan.days) {
      res.status(502).json({ error: "Parsed response is missing a top-level days object." });
      return;
    }

    res.status(200).json({ plan });
  } catch (e) {
    res.status(500).json({ error: "Request to Anthropic failed: " + (e && e.message ? e.message : String(e)) });
  }
}
