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
  const recentTraining = (body && body.recentTraining) || "none";

  const prompt = [
    "You are a meticulous high-end personal trainer. You track your client's every set, apply evidence-based progressive overload, and prescribe exact weights and reps so he never has to guess in the gym. The client is a 37-year-old male who wants to build muscle, lose fat, and improve at basketball and tennis. He does reformer Pilates weekly and contrast therapy (sauna and cold plunge) on Sundays.",
    "Fixed activities this week: " + fixedActivities,
    "Additional context: " + context,
    "Recent training data (weight x reps per set, weights in lb): " + recentTraining,
    "Rules: 4 lifting sessions per week using an upper/lower split with both strength and hypertrophy days. Keep every session under 60 minutes. Do not stack heavy lifting on the same day as intense sport. Include power work such as box jumps or broad jumps on lower-body days. Include shoulder prehab such as face pulls on upper-body days. Apply progressive overload and state in each exercise's notes when to add weight.",
    "The week is Monday-anchored: include all seven days Monday through Sunday. Keep the plan compact: no warm-up sections, at most two sections per day, and keep notes brief or empty.",
    "Respond ONLY with valid JSON, no markdown and no backticks. The shape is: a top-level \"days\" object whose keys are Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday. Each day is an object with: title (string), type (one of: lift, sport, recovery, class, other), duration (string, may be empty), and sections (array; may be empty for rest, sport, class, or recovery days). Each section has name (string) and exercises (array). Each exercise has name (string), sets (string), reps (string), notes (string, may be empty), weights (array of numbers, one per set), and repsPerSet (array of integers, one per set, same length as weights). Prescription rules: 1) Every exercise on a lift day MUST include both weights and repsPerSet fully filled in, one entry per set, so the client never has an empty slot. 2) ALL weights are in pounds (lb) ONLY. Never mention kilograms or kg anywhere, including notes. Progress in 5 lb increments for upper-body lifts and 10 lb for lower-body lifts, rounded to standard plate loads. 3) The first compound movement of each lift session starts with 1 to 2 warmup sets at roughly 50 to 70 percent of the working weight, included in the weights and repsPerSet arrays and counted in the sets string, with notes saying which sets are warmups. Later isolation exercises need no warmups. 4) Use the recent training data for progression: if the client hit the top of the target rep range on all working sets last time, increase the working weight; otherwise repeat the weight and program one more rep per set. Heavier first working sets with a small drop on later sets is fine. 5) For exercises with no recent data, prescribe a conservative starting weight inferred from his comparable lifts and say in notes that it is a starting estimate to adjust for form. 6) Vary exercise selection week to week: keep one or two key indicator lifts per muscle group consistent for measurable progression, but rotate secondary and accessory movements (for example swap incline barbell for incline dumbbell, cable row for chest-supported row) so sessions do not repeat identically. Use the recent training data to see what he did recently and choose fresh variations."
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
        max_tokens: 8000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      const msg = (data && data.error && data.error.message) || ("Anthropic API returned status " + anthropicRes.status);
      res.status(502).json({ error: msg });
      return;
    }

    if (data.stop_reason === "max_tokens") {
      res.status(502).json({ error: "The plan was too long and got cut off. Try again, or add context asking for a shorter plan." });
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
      res.status(502).json({ error: "Claude did not return valid JSON. Raw start: " + text.slice(0, 400) + " ... Raw end: " + text.slice(-200) });
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
