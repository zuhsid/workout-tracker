// Serverless function (Vercel/Netlify compatible) that calls the Anthropic API.
// The API key lives ONLY here, in the server environment, never in the browser.

// ---------------------------------------------------------------------------
// Scheduling constraints layer
// ---------------------------------------------------------------------------
// These enforce the three rules that the model alone cannot be trusted to keep:
//   1. Pilates is treated as a leg-focused (lower-body) day. No lower/leg
//      lifting session may sit on the day immediately before OR after it.
//   2. Exactly 2 upper + 2 lower weighted lifting sessions, alternating rather
//      than clustered.
//   3. No two consecutive days train the same muscle group.
//
// Tagging Pilates as 'lower' is the key trick: it makes rule 1 fall out of the
// generic no-consecutive-same-group check automatically, on both sides, with
// no special-case code.

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Muscle groups for a single day, used ONLY for adjacency rules.
// upper/lower lift days come from the title; Pilates is forced to 'lower'.
// Everything else (sport, contrast, rest) is neutral (no adjacency effect).
function dayGroups(day) {
  if (!day) return [];
  const title = String(day.title || "").toLowerCase();
  const type = String(day.type || "").toLowerCase();
  if (title.includes("pilates")) return ["lower"]; // leg-focused
  if (type === "lift") {
    if (title.includes("upper")) return ["upper"];
    if (title.includes("lower") || title.includes("leg")) return ["lower"];
  }
  return [];
}

function restDay() {
  return { title: "Rest / Active Recovery", type: "recovery", duration: "", sections: [] };
}

// Anchored days keep their slot: Pilates and any fixed sport.
// Rest days (including optional contrast therapy) and the four lifting
// sessions are movable, so the reorderer can freely place them.
function isAnchored(day) {
  if (!day) return false;
  const title = String(day.title || "").toLowerCase();
  const type = String(day.type || "").toLowerCase();
  return (
    type === "class" ||
    type === "sport" ||
    title.includes("pilates")
  );
}

// Takes the plan.days OBJECT. Returns { valid, violations }.
function validateWeek(days) {
  const week = DAY_ORDER.map((name) => ({ name, day: days[name] || null }));
  const groups = week.map((w) => dayGroups(w.day));
  const violations = [];

  // Rules 1 + 3: no two consecutive days share a muscle group.
  for (let i = 0; i < week.length - 1; i++) {
    const a = groups[i];
    const b = groups[i + 1];
    if (a.length && b.length && a.some((g) => b.includes(g))) {
      const shared = a.filter((g) => b.includes(g)).join(", ");
      const at = week[i].day ? week[i].day.title : "empty";
      const bt = week[i + 1].day ? week[i + 1].day.title : "empty";
      violations.push(
        `${week[i].name} (${at}) and ${week[i + 1].name} (${bt}) both train ${shared} on consecutive days`
      );
    }
  }

  // Rule 2: exactly 2 upper + 2 lower WEIGHTED lifting sessions (Pilates excluded).
  let wUpper = 0;
  let wLower = 0;
  for (const w of week) {
    const d = w.day;
    if (d && String(d.type || "").toLowerCase() === "lift") {
      const t = String(d.title || "").toLowerCase();
      if (t.includes("upper")) wUpper++;
      else if (t.includes("lower") || t.includes("leg")) wLower++;
    }
  }
  if (wUpper !== 2 || wLower !== 2) {
    violations.push(
      `Split imbalance: expected 2 upper + 2 lower lifting sessions, got ${wUpper} upper + ${wLower} lower`
    );
  }

  return { valid: violations.length === 0, violations };
}

// Deterministic fallback. Keeps anchored days (Pilates, contrast, sport) in
// place and reassigns the movable contents (4 lifts + rest days) to the free
// slots via backtracking until validateWeek passes. Returns a new days object,
// or null if no valid arrangement exists (only happens when the anchors
// themselves conflict).
function reorderToValid(days) {
  const anchored = {};
  const movableSlots = [];
  const movableContents = [];

  for (const name of DAY_ORDER) {
    const d = days[name] || null;
    if (isAnchored(d)) anchored[name] = d;
    else {
      movableSlots.push(name);
      movableContents.push(d || restDay());
    }
  }

  const used = new Array(movableContents.length).fill(false);
  const partial = {};

  const neighborOk = (name, content) => {
    const idx = DAY_ORDER.indexOf(name);
    const g = dayGroups(content);
    if (!g.length) return true;
    for (const nb of [DAY_ORDER[idx - 1], DAY_ORDER[idx + 1]]) {
      if (!nb) continue;
      const neighbor = anchored[nb] || partial[nb];
      if (!neighbor) continue; // not placed yet; final validateWeek catches it
      const ng = dayGroups(neighbor);
      if (ng.length && g.some((x) => ng.includes(x))) return false;
    }
    return true;
  };

  const backtrack = (slotIdx) => {
    if (slotIdx === movableSlots.length) {
      const candidate = Object.assign({}, anchored, partial);
      return validateWeek(candidate).valid ? candidate : null;
    }
    const name = movableSlots[slotIdx];
    for (let c = 0; c < movableContents.length; c++) {
      if (used[c]) continue;
      const content = movableContents[c];
      if (!neighborOk(name, content)) continue;
      used[c] = true;
      partial[name] = content;
      const result = backtrack(slotIdx + 1);
      if (result) return result;
      used[c] = false;
      delete partial[name];
    }
    return null;
  };

  return backtrack(0);
}

// ---------------------------------------------------------------------------
// Anthropic call + parse helpers
// ---------------------------------------------------------------------------
async function callAnthropic(apiKey, userContent) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  const data = await r.json();
  return { ok: r.ok, status: r.status, data };
}

// Returns { plan } or { error } (with optional text for JSON failures).
function parsePlan(data) {
  if (data && data.stop_reason === "max_tokens") {
    return { error: "The plan was too long and got cut off. Try again, or add context asking for a shorter plan." };
  }
  const text = ((data && data.content) || [])
    .map((b) => (b && b.type === "text" ? b.text : ""))
    .join("")
    .replace(/```json|```/g, "")
    .trim();
  let plan;
  try {
    plan = JSON.parse(text);
  } catch (_) {
    return { error: "Claude did not return valid JSON. Raw start: " + text.slice(0, 400) + " ... Raw end: " + text.slice(-200) };
  }
  if (!plan || !plan.days) return { error: "Parsed response is missing a top-level days object." };
  return { plan };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------
function buildBasePrompt(fixedActivities, context, recentTraining) {
  return [
    "You are a meticulous high-end personal trainer. You track your client's every set, apply evidence-based progressive overload, and prescribe exact weights and reps so he never has to guess in the gym. The client is a 37-year-old male who wants to build muscle, lose fat, and improve at basketball and tennis. He does reformer Pilates weekly. He sometimes does contrast therapy (sauna and cold plunge) as optional recovery, but not on any fixed day, so treat it as an ordinary rest/recovery day and do not anchor it to Sunday.",
    "Fixed activities this week: " + fixedActivities,
    "Additional context: " + context,
    "Recent training data (weight x reps per set, weights in lb), possibly followed by the client's own session notes: " + recentTraining,
    "If the client's session notes mention pain, tweaks, fatigue, or difficulty, adjust the plan accordingly: work around a complaining joint with safer variations, hold or reduce weight where a lift was described as a grind, and push a bit more where he reported it felt easy. Reference the relevant note briefly in the affected exercise's notes field so he knows why.",
    // ----- SCHEDULING CONSTRAINTS (new) -----
    "SCHEDULING CONSTRAINTS (MANDATORY, the plan is rejected if any are broken): Treat reformer Pilates as a leg-focused lower-body day. Do NOT place any lower-body or leg lifting session on the day immediately before OR immediately after Pilates. Never schedule the same muscle-group focus on two consecutive days: no two lower-body days back to back, no two upper-body days back to back, and no lower-body day adjacent to Pilates on either side. Alternate upper and lower across the week so the week contains exactly two upper-body and two lower-body lifting sessions, paired rather than clustered. Keep Pilates and any fixed activities on their given days.",
    // ----------------------------------------
    "Rules: 4 lifting sessions per week using an upper/lower split with both strength and hypertrophy days. Keep every session under 60 minutes. Do not stack heavy lifting on the same day as intense sport. Include power work such as box jumps or broad jumps on lower-body days. Include shoulder prehab such as face pulls on upper-body days. Apply progressive overload and state in each exercise's notes when to add weight.",
    "The week is Monday-anchored: include all seven days Monday through Sunday. Keep the plan compact: no warm-up sections, at most two sections per day, and keep notes brief or empty.",
    "Respond ONLY with valid JSON, no markdown and no backticks. The shape is: a top-level \"days\" object whose keys are Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday. Each day is an object with: title (string), type (one of: lift, sport, recovery, class, other), duration (string, may be empty), and sections (array; may be empty for rest, sport, class, or recovery days). Each section has name (string) and exercises (array). Each exercise has name (string), sets (string), reps (string), notes (string, may be empty), weights (array of numbers, one per set), and repsPerSet (array of integers, one per set, same length as weights). Prescription rules: 1) Every exercise on a lift day MUST include both weights and repsPerSet fully filled in, one entry per set, so the client never has an empty slot. 2) ALL weights are in pounds (lb) ONLY. Never mention kilograms or kg anywhere, including notes. Progress in 5 lb increments for upper-body lifts and 10 lb for lower-body lifts, rounded to standard plate loads. 3) The first compound movement of each lift session starts with 1 to 2 warmup sets at roughly 50 to 70 percent of the working weight, included in the weights and repsPerSet arrays and counted in the sets string, with notes saying which sets are warmups. Later isolation exercises need no warmups. 4) Progression must always move forward: every exercise with recent data gets EITHER more weight OR more reps than last time, never an identical prescription two weeks running. If the client hit the top of the target rep range on all working sets, raise the working weight across all sets. If he hit it on most sets, raise the weight on the first one or two working sets (a heavier top set) and keep the rest, so every week includes exposure to a heavier load. Only if he clearly missed the rep targets, or his notes describe pain or a grinding effort, hold the weight and add one rep per set instead. Heavier first working sets with a small drop on later sets is encouraged. The goal is steady, aggressive but sustainable strength gains, not repeating last week. 5) Dumbbell convention: every dumbbell weight in the recent training data AND in your prescriptions is the COMBINED weight of both dumbbells, not per hand. So a prescription of 100 means two 50 lb dumbbells. Progress dumbbell lifts in 10 lb combined increments (5 lb per dumbbell) and make sure the per-dumbbell weight is a standard size. In the notes for each dumbbell exercise, spell it out, for example: 100 lb total = 50 lb per dumbbell. Exception: exercises performed with ONE dumbbell at a time (single-arm rows, one-arm presses, goblet squats, single-leg work) use the weight of that single dumbbell, progressed in 5 lb steps, and their history is already in single-dumbbell terms. 6) For exercises with no recent data, prescribe a conservative starting weight inferred from his comparable lifts and say in notes that it is a starting estimate to adjust for form. 7) Measurement conventions for jumps: box jump values are heights in inches; broad jump values are distances in yards. In the recent training data and in your weights arrays for these exercises, use those units, never pounds. Progress jumps conservatively (box height in 2 to 3 inch steps, broad jump distance in 0.25 yd steps) and only when recent attempts were solid. 8) Weight history may only inform an exercise if it is the SAME exercise or a true variant: same primary muscle group AND same movement pattern, like barbell bench and dumbbell bench. NEVER carry weights across different muscle groups or patterns. Lying or seated leg curls (hamstrings) and leg extensions (quads) are unrelated exercises and must never share weight history. Rows never inform presses, curls never inform extensions. When unsure whether two exercises are true variants, treat the exercise as having no data and give a conservative starting estimate instead. 9) Vary exercise selection week to week: keep one or two key indicator lifts per muscle group consistent for measurable progression, but rotate secondary and accessory movements (for example swap incline barbell for incline dumbbell, cable row for chest-supported row) so sessions do not repeat identically. Use the recent training data to see what he did recently and choose fresh variations.",
  ].join(" ");
}

function buildCorrectionPrompt(basePrompt, plan, violations) {
  return (
    basePrompt +
    " Your previous attempt broke the mandatory scheduling constraints. Here is the plan you produced: " +
    JSON.stringify(plan) +
    " The specific violations were: " +
    violations.join("; ") +
    ". Produce a corrected full plan as JSON with the SAME workout contents (identical exercises, weights, and reps in each session) but move which day each session falls on so that NONE of the scheduling constraints are broken. Keep Pilates and any fixed activities on their days. Respond ONLY with valid JSON in the same shape."
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
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

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }
  const fixedActivities = (body && body.fixedActivities) || "none";
  const context = (body && body.context) || "none";
  const recentTraining = (body && body.recentTraining) || "none";

  const basePrompt = buildBasePrompt(fixedActivities, context, recentTraining);
  const MAX_ATTEMPTS = 3;

  try {
    let plan = null;
    let violations = [];
    let prompt = basePrompt;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { ok, status, data } = await callAnthropic(apiKey, prompt);
      if (!ok) {
        const msg = (data && data.error && data.error.message) || ("Anthropic API returned status " + status);
        res.status(502).json({ error: msg });
        return;
      }

      const parsed = parsePlan(data);
      if (parsed.error) {
        res.status(502).json({ error: parsed.error });
        return;
      }

      plan = parsed.plan;
      const check = validateWeek(plan.days);
      if (check.valid) {
        res.status(200).json({ plan });
        return;
      }

      // Invalid: keep the violations and try a correction pass.
      violations = check.violations;
      prompt = buildCorrectionPrompt(basePrompt, plan, violations);
    }

    // Retries exhausted. Try the deterministic reorder on the last plan.
    const fixed = reorderToValid(plan.days);
    if (fixed) {
      res.status(200).json({ plan: { ...plan, days: fixed } });
      return;
    }

    // Could not solve even deterministically (anchors conflict). Return the
    // plan with a warning rather than failing, so the client still gets one.
    res.status(200).json({ plan, warning: "Could not satisfy all scheduling rules automatically: " + violations.join("; ") });
  } catch (e) {
    res.status(500).json({ error: "Request to Anthropic failed: " + (e && e.message ? e.message : String(e)) });
  }
}
