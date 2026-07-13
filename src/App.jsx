import { useState, useEffect, useRef } from "react";
import { Chart, registerables } from "chart.js";
Chart.register(...registerables);

const STORAGE_KEYS = {
  fixedActivities: "wt_fixed_activities",
  weeklyPlans: "wt_weekly_plans",
  workoutLogs: "wt_workout_logs",
  prs: "wt_prs",
};

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const HEIGHT_EXERCISES = ["box jumps", "box jump", "broad jumps", "broad jump"];

const COLOR = {
  lift: { bg: "#E6F1FB", text: "#0C447C" },
  sport: { bg: "#E1F5EE", text: "#085041" },
  recovery: { bg: "#F1EFE8", text: "#444441" },
  class: { bg: "#EEEDFE", text: "#3C3489" },
  other: { bg: "#FAEEDA", text: "#633806" },
};

const THIS_WEEK_KEY = "2026-06-29";

const PRELOADED_PLAN = {
  days: {
    Monday: {
      title: "Leg day", type: "lift", duration: "55 min",
      sections: [
        { name: "Power", exercises: [
          { name: "Box jumps", sets: "3", reps: "4", notes: "Fresh legs, full effort" }
        ]},
        { name: "Strength", exercises: [
          { name: "Back squat", sets: "4", reps: "5-8", notes: "Add 10 lb when you hit 8 on all sets" },
          { name: "Romanian deadlift", sets: "3", reps: "8-10", notes: "" },
          { name: "Bulgarian split squat", sets: "3", reps: "8-10/leg", notes: "" },
          { name: "Hamstring curl", sets: "3", reps: "12-15", notes: "" },
          { name: "Calf raises", sets: "3", reps: "15", notes: "" }
        ]}
      ]
    },
    Tuesday: {
      title: "Upper hypertrophy", type: "lift", duration: "55 min",
      sections: [
        { name: "Main lifts", exercises: [
          { name: "Incline bench press", sets: "4", reps: "8-12", notes: "Add 5 lb when you hit 12 on all sets" },
          { name: "Seated cable row", sets: "4", reps: "10-12", notes: "" },
          { name: "DB shoulder press", sets: "3", reps: "8-12", notes: "" },
          { name: "Lat pulldown", sets: "3", reps: "10-12", notes: "" },
          { name: "Face pulls", sets: "3", reps: "15", notes: "Shoulder prehab, don't skip" }
        ]}
      ]
    },
    Wednesday: { title: "Reformer Pilates", type: "class", duration: "50 min", sections: [] },
    Thursday: {
      title: "Pull-focused upper", type: "lift", duration: "55 min",
      sections: [
        { name: "Main lifts", exercises: [
          { name: "Pull-ups", sets: "4", reps: "6-10", notes: "Add reps or weight as you progress" },
          { name: "Barbell row", sets: "4", reps: "8-10", notes: "Add 5 lb when you hit 10 on all sets" },
          { name: "Single-arm DB row", sets: "3", reps: "10-12/arm", notes: "" },
          { name: "Rear delt fly", sets: "3", reps: "12-15", notes: "" }
        ]},
        { name: "Arms", exercises: [
          { name: "Hammer curl", sets: "3", reps: "10-12", notes: "" },
          { name: "Incline DB curl", sets: "3", reps: "10-12", notes: "" }
        ]}
      ]
    },
    Friday: {
      title: "Push / pull + conditioning", type: "lift", duration: "55 min",
      sections: [
        { name: "Hypertrophy", exercises: [
          { name: "Arnold press", sets: "3", reps: "10", notes: "" },
          { name: "Cable chest flys", sets: "3", reps: "12-15", notes: "" },
          { name: "Barbell curl", sets: "3", reps: "10-12", notes: "" },
          { name: "Overhead tricep extension", sets: "3", reps: "12", notes: "" }
        ]},
        { name: "Conditioning", exercises: [
          { name: "Battle ropes", sets: "3", reps: "30 sec", notes: "" },
          { name: "Med ball slams", sets: "3", reps: "15", notes: "" }
        ]}
      ]
    },
    Saturday: { title: "Open / rest", type: "recovery", duration: "", sections: [] },
    Sunday: {
      title: "Contrast therapy", type: "recovery", duration: "",
      sections: [
        { name: "Protocol", exercises: [
          { name: "Sauna", sets: "3-4", reps: "12-15 min", notes: "" },
          { name: "Cold plunge", sets: "3", reps: "2-3 min", notes: "" }
        ]}
      ]
    }
  }
};

function useStorage(key, fallback) {
  const [val, setVal] = useState(() => {
    try {
      const r = localStorage.getItem(key);
      return r != null ? JSON.parse(r) : fallback;
    } catch (_) { return fallback; }
  });
  const loaded = useRef(true);
  const save = async (v) => {
    setVal(v);
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {}
  };
  return [val, save, loaded];
}

// Synchronous localStorage read used by the save path to merge before writing.
function readStorage(key, fallback) {
  try {
    const r = localStorage.getItem(key);
    return r != null ? JSON.parse(r) : fallback;
  } catch (_) { return fallback; }
}

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekKey(offset = 0) {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d); mon.setDate(diff + offset * 7);
  return toLocalDateStr(mon);
}

function weekLabel(key) {
  const d = new Date(key + "T00:00:00");
  const end = new Date(key + "T00:00:00"); end.setDate(d.getDate() + 6);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function getDayNameFromDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1];
}

function getWeekKeyFromDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d); mon.setDate(diff);
  return toLocalDateStr(mon);
}

// Summarize the last few weeks of lifting so plan generation can apply
// progressive overload from real numbers instead of guessing.
function summarizeRecentTraining(workoutLogs, weeksBack = 4) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeksBack * 7);
  const cutoffStr = toLocalDateStr(cutoff);
  const byExercise = {};
  (workoutLogs || []).forEach(log => {
    if (log.type !== "lift" || !log.date || log.date < cutoffStr) return;
    (log.exercises || []).forEach(ex => {
      if (!ex.name) return;
      const key = ex.name.toLowerCase().trim();
      const sets = (ex.sets || [])
        .map(s => ({ w: parseFloat(s.weight), r: parseInt(s.reps) }))
        .filter(s => s.w > 0 && s.r > 0);
      if (!sets.length) return;
      const entry = byExercise[key] || { name: ex.name, lastDate: "", lastSets: [], best: null };
      if (log.date >= entry.lastDate) {
        entry.lastDate = log.date;
        entry.lastSets = sets;
      }
      sets.forEach(s => {
        if (!entry.best || s.w > entry.best.w || (s.w === entry.best.w && s.r > entry.best.r)) {
          entry.best = s;
        }
      });
      byExercise[key] = entry;
    });
  });
  const lines = Object.values(byExercise).map(e =>
    e.name + " (last " + e.lastDate + "): " +
    e.lastSets.map(s => s.w + "x" + s.r).join(", ") +
    "; best recent set: " + e.best.w + "x" + e.best.r
  );
  // Include the client's own session notes so generation can react to them
  const noteLines = (workoutLogs || [])
    .filter(l => l.type === "lift" && l.date >= cutoffStr && l.notes && l.notes.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(l => l.date + " (" + (l.name || "session") + "): " + l.notes.trim().slice(0, 300));
  let out = lines.length ? lines.join(". ") : "";
  if (noteLines.length) out += (out ? ". " : "") + "Client session notes: " + noteLines.join(" | ");
  return out;
}

function isDumbbellExercise(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes("dumbbell") || /(^|[^a-z])db([^a-z]|$)/.test(n);
}

function planExercisesToLogExercises(sections) {
  if (!sections || sections.length === 0) return [{ name: "", sets: [{ weight: "", reps: "", rpe: "", rest: "" }] }];
  const exercises = [];
  sections.forEach(sec => {
    (sec.exercises || []).forEach(ex => {
      // Prefer the prescription arrays for set count so warmup sets get rows too
      const arrLen = Math.max(
        Array.isArray(ex.weights) ? ex.weights.length : 0,
        Array.isArray(ex.repsPerSet) ? ex.repsPerSet.length : 0
      );
      const setCount = arrLen || parseInt(ex.sets) || 3;
      exercises.push({
        name: ex.name,
        plannedSets: ex.sets,
        plannedReps: ex.reps,
        notes: ex.notes || "",
        sets: Array.from({ length: setCount }, (_, k) => ({
          weight: Array.isArray(ex.weights) && ex.weights[k] != null ? String(ex.weights[k]) : "",
          reps: Array.isArray(ex.repsPerSet) && ex.repsPerSet[k] != null ? String(ex.repsPerSet[k]) : "",
          rpe: "", rest: ""
        }))
      });
    });
  });
  return exercises.length > 0 ? exercises : [{ name: "", sets: [{ weight: "", reps: "", rpe: "", rest: "" }] }];
}

const TABS = ["This week", "Log workout", "Progress", "Records", "Settings"];

export default function App() {
  const [tab, setTab] = useState(0);
  const [fixedActivities, setFixedActivities] = useStorage(STORAGE_KEYS.fixedActivities, []);
  const [weeklyPlans, setWeeklyPlans] = useStorage(STORAGE_KEYS.weeklyPlans, {});
  const [workoutLogs, setWorkoutLogs] = useStorage(STORAGE_KEYS.workoutLogs, []);
  const [prs, setPrs] = useStorage(STORAGE_KEYS.prs, {});
  const [weekOffset, setWeekOffset] = useState(0);
  const weekKey = getWeekKey(weekOffset);

  const effectivePlans = { [THIS_WEEK_KEY]: PRELOADED_PLAN, ...weeklyPlans };

  return (
    <div style={{ padding: "1rem 0", fontFamily: "var(--font-sans)", color: "var(--color-text-primary)" }}>
      <h2 className="sr-only">Workout tracker app</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ background: tab === i ? "var(--color-background-info)" : "transparent",
              color: tab === i ? "var(--color-text-info)" : "var(--color-text-secondary)",
              border: tab === i ? "0.5px solid var(--color-border-info)" : "0.5px solid var(--color-border-tertiary)",
              borderRadius: 8, padding: "6px 14px", fontSize: 13, fontWeight: tab === i ? 500 : 400, cursor: "pointer" }}>
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <WeekView weekKey={weekKey} weekOffset={weekOffset} setWeekOffset={setWeekOffset} workoutLogs={workoutLogs}
        fixedActivities={fixedActivities} weeklyPlans={weeklyPlans} setWeeklyPlans={setWeeklyPlans}
        effectivePlans={effectivePlans} setTab={setTab} />}
      {tab === 1 && <LogWorkout workoutLogs={workoutLogs} setWorkoutLogs={setWorkoutLogs}
        prs={prs} setPrs={setPrs} effectivePlans={effectivePlans} />}
      {tab === 2 && <Progress workoutLogs={workoutLogs} />}
      {tab === 3 && <Records prs={prs} />}
      {tab === 4 && <Settings fixedActivities={fixedActivities} setFixedActivities={setFixedActivities} />}
    </div>
  );
}

function WeekView({ weekKey, weekOffset, setWeekOffset, workoutLogs, fixedActivities, weeklyPlans, setWeeklyPlans, effectivePlans, setTab }) {
  const [loading, setLoading] = useState(false);
  const [genError, setGenError] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");

  const loadPastedPlan = async () => {
    setPasteError("");
    let parsed;
    try { parsed = JSON.parse(pasteText.replace(/```json|```/g, "").trim()); }
    catch (e) { setPasteError("Could not parse: " + e.message); return; }
    if (!parsed.days) { setPasteError("Missing top-level days object."); return; }
    const newPlans = { ...weeklyPlans, [weekKey]: parsed };
    await setWeeklyPlans(newPlans);
    setShowPaste(false); setPasteText("");
  };
  const [weekContext, setWeekContext] = useState("");
  const plan = effectivePlans[weekKey] || null;
  const isPreloaded = weekKey === THIS_WEEK_KEY && !weeklyPlans[THIS_WEEK_KEY];

  const generatePlan = async () => {
    setLoading(true);
    setGenError("");
    const fixedList = fixedActivities.map(a => a.day + ": " + a.name + " (" + a.type + ")").join(", ") || "none";
    const recentTraining = summarizeRecentTraining(workoutLogs);
    const payload = { fixedActivities: fixedList, context: weekContext || "none", recentTraining: recentTraining || "none" };

    let res, data;
    try {
      res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      setGenError("Could not reach the server. Is the app deployed / dev server running? (" + e.message + ")");
      setLoading(false); return;
    }
    if (!res.ok) {
      let t = ""; try { t = await res.text(); } catch (_) {}
      setGenError("Server error " + res.status + ": " + t.slice(0, 300));
      setLoading(false); return;
    }
    try { data = await res.json(); } catch (e) {
      setGenError("Server did not return JSON."); setLoading(false); return;
    }
    if (data.error) { setGenError(data.error); setLoading(false); return; }
    if (!data.plan || !data.plan.days) {
      setGenError("Response missing a valid plan."); setLoading(false); return;
    }
    const newPlans = { ...weeklyPlans, [weekKey]: data.plan };
    setWeeklyPlans(newPlans);
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "1rem" }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", background: "transparent", color: "var(--color-text-primary)" }}>
          ←
        </button>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{weekLabel(weekKey)}</span>
        <button onClick={() => setWeekOffset(w => w + 1)} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: 8, padding: "6px 12px", cursor: "pointer", background: "transparent", color: "var(--color-text-primary)" }}>
          →
        </button>
        {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "transparent", border: "none", cursor: "pointer" }}>Today</button>}
      </div>

      {!plan && (
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1.25rem", marginBottom: "1rem" }}>
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>Any variable activities this week? (e.g. "tennis lesson Thursday morning, basketball Friday")</p>
          <textarea value={weekContext} onChange={e => setWeekContext(e.target.value)}
            placeholder="Optional — leave blank to use only your fixed schedule"
            style={{ width: "100%", minHeight: 72, fontSize: 13, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", padding: "8px 10px", boxSizing: "border-box", resize: "vertical" }} />
          <button onClick={generatePlan} disabled={loading}
            style={{ marginTop: 10, padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", cursor: loading ? "default" : "pointer", fontSize: 13 }}>
            {loading ? "Generating plan..." : "Generate this week's plan ↗"}
          </button>
          {genError && <p style={{ marginTop: 10, fontSize: 12, color: "#b91c1c", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{genError}</p>}
          <div style={{ marginTop: 12, borderTop: "0.5px solid var(--color-border-tertiary)", paddingTop: 12 }}>
            <button onClick={() => setShowPaste(s => !s)} style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              {showPaste ? "Hide paste option" : "Or paste a plan manually (fallback)"}
            </button>
            {showPaste && (
              <div style={{ marginTop: 8 }}>
                <textarea value={pasteText} onChange={e => setPasteText(e.target.value)}
                  placeholder="Paste plan JSON here"
                  style={{ width: "100%", minHeight: 90, fontSize: 12, fontFamily: "var(--font-mono, monospace)", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", padding: "8px 10px", boxSizing: "border-box", resize: "vertical" }} />
                <button onClick={loadPastedPlan} style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", cursor: "pointer", fontSize: 13 }}>
                  Load pasted plan
                </button>
                {pasteError && <p style={{ marginTop: 8, fontSize: 12, color: "#b91c1c", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pasteError}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {plan && (
        <>
          {isPreloaded && (
            <div style={{ background: "#E1F5EE", border: "0.5px solid #5DCAA5", borderRadius: 10, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: "#085041" }}>
              ℹ This week comes pre-loaded with your current plan. Use Regenerate to replace it with a freshly generated one.
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button onClick={async () => { await setWeeklyPlans({ ...weeklyPlans, [weekKey]: null }); }}
              style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "transparent", border: "none", cursor: "pointer" }}>
              ↺ Regenerate
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {DAYS.map((day, di) => {
              const d = plan.days?.[day];
              if (!d) return null;
              const c = COLOR[d.type] || COLOR.other;
              const isLift = d.type === "lift";
              return (
                <div key={day} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem 1.25rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: d.sections?.length ? 10 : 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, minWidth: 80, color: "var(--color-text-secondary)" }}>{day}</span>
                    <span style={{ fontSize: 14, fontWeight: 500, flex: 1 }}>{d.title}</span>
                    <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6 }}>{d.type}</span>
                    {d.duration && <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{d.duration}</span>}
                    {isLift && (
                      <button onClick={() => setTab(1)}
                        style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", whiteSpace: "nowrap" }}>
                        Log ↗
                      </button>
                    )}
                  </div>
                  {d.sections?.map((sec, si) => (
                    <div key={si} style={{ marginBottom: si < d.sections.length - 1 ? 10 : 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "8px 0 5px" }}>{sec.name}</p>
                      {sec.exercises?.map((ex, ei) => (
                        <div key={ei}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", borderBottom: ei < sec.exercises.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", gap: 8 }}>
                            <span style={{ fontSize: 13 }}>{ex.name}</span>
                            <span style={{ fontSize: 12, color: "var(--color-text-secondary)", whiteSpace: "nowrap" }}>{ex.sets}×{ex.reps}{Array.isArray(ex.weights) && ex.weights.length ? " @ " + [...new Set(ex.weights)].join("/") + " lb" : ""}</span>
                          </div>
                          {ex.notes ? <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "2px 0 4px", fontStyle: "italic" }}>{ex.notes}</p> : null}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function LogWorkout({ workoutLogs, setWorkoutLogs, prs, setPrs, effectivePlans }) {
  const todayStr = toLocalDateStr(new Date());
  const [date, setDate] = useState(todayStr);
  const [sessionType, setSessionType] = useState("lift");
  const [sessionName, setSessionName] = useState("");
  const [exercises, setExercises] = useState([{ name: "", sets: [{ weight: "", reps: "", rpe: "", rest: "" }] }]);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [preloaded, setPreloaded] = useState(false);

  const loadFromPlan = (dateStr) => {
    const wk = getWeekKeyFromDate(dateStr);
    const plan = effectivePlans[wk];
    if (!plan) return false;
    const dayName = getDayNameFromDate(dateStr);
    const dayPlan = plan.days?.[dayName];
    if (!dayPlan) return false;
    setSessionType(dayPlan.type || "lift");
    setSessionName(dayPlan.title || "");
    if (dayPlan.sections?.length) {
      setExercises(planExercisesToLogExercises(dayPlan.sections));
      return true;
    }
    return false;
  };

  // Tracks which date we last autoloaded, so each date autoloads at most once
  const autoloadedDateRef = useRef(null);
  useEffect(() => {
    if (autoloadedDateRef.current === date) return;
    // Never overwrite anything the user has already typed
    const userHasEntered = exercises.some(ex => ex.name || ex.sets.some(s => s.weight || s.reps));
    if (userHasEntered) { autoloadedDateRef.current = date; return; }
    const loaded = loadFromPlan(date);
    if (loaded) { setPreloaded(true); autoloadedDateRef.current = date; }
  }, [effectivePlans, date, exercises]);

  const handleDateChange = (newDate) => {
    setDate(newDate);
    setPreloaded(false);
    setSaved(false);
    const loaded = loadFromPlan(newDate);
    if (loaded) setPreloaded(true);
    else {
      setExercises([{ name: "", sets: [{ weight: "", reps: "", rpe: "", rest: "" }] }]);
      setSessionName(""); setSessionType("lift");
    }
  };

  const addExercise = () => setExercises(e => [...e, { name: "", sets: [{ weight: "", reps: "", rpe: "", rest: "" }] }]);
  const removeExercise = i => setExercises(e => e.filter((_, j) => j !== i));
  const updateExerciseName = (i, v) => setExercises(e => { const n = [...e]; n[i] = { ...n[i], name: v }; return n; });
  const addSet = i => setExercises(e => { const n = [...e]; n[i].sets = [...n[i].sets, { weight: "", reps: "", rpe: "", rest: "" }]; return n; });
  const removeSet = (i, j) => setExercises(e => { const n = [...e]; n[i].sets = n[i].sets.filter((_, k) => k !== j); return n; });
  const updateSet = (i, j, field, v) => setExercises(e => { const n = [...e]; n[i].sets[j] = { ...n[i].sets[j], [field]: v }; return n; });

  const save = async () => {
    const log = { id: Date.now(), date, type: sessionType, name: sessionName, exercises, notes };
    const existingLogs = readStorage(STORAGE_KEYS.workoutLogs, workoutLogs);
    const newLogs = [log, ...existingLogs];
    await setWorkoutLogs(newLogs);
    const existingPrs = readStorage(STORAGE_KEYS.prs, prs);
    const newPrs = { ...existingPrs };
    exercises.forEach(ex => {
      if (!ex.name) return;
      const key = ex.name.toLowerCase().trim();
      const isH = HEIGHT_EXERCISES.includes(key);
      ex.sets.forEach(s => {
        const w = parseFloat(s.weight), r = parseInt(s.reps);
        if (!w || (!r && !isH)) return;
        if (isH) {
          if (!newPrs[key] || w > newPrs[key].weight) {
            newPrs[key] = { weight: w, reps: r || 1, date, exerciseName: ex.name, isHeight: true };
          }
        } else {
          if (!newPrs[key] || w > newPrs[key].weight || (w === newPrs[key].weight && r > newPrs[key].reps)) {
            newPrs[key] = { weight: w, reps: r, date, exerciseName: ex.name };
          }
        }
      });
    });
    await setPrs(newPrs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: "1rem" }}>
        <div>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Date</p>
          <input type="date" value={date} onChange={e => handleDateChange(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
        </div>
        <div>
          <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Session type</p>
          <select value={sessionType} onChange={e => setSessionType(e.target.value)} style={{ width: "100%" }}>
            <option value="lift">Lifting</option>
            <option value="sport">Sport</option>
            <option value="class">Class / Pilates</option>
            <option value="recovery">Recovery</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Session name</p>
        <input placeholder="e.g. Upper strength, Lower hypertrophy" value={sessionName} onChange={e => setSessionName(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
      </div>

      {preloaded && (
        <div style={{ background: "#E6F1FB", border: "0.5px solid #85B7EB", borderRadius: 10, padding: "8px 14px", marginBottom: 12, fontSize: 13, color: "#0C447C", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>📅 Exercises loaded from your {getDayNameFromDate(date)} plan. Fill in your actual weights and reps.</span>
          <button onClick={() => { setExercises([{ name: "", sets: [{ weight: "", reps: "", rpe: "", rest: "" }] }]); setPreloaded(false); }}
            style={{ fontSize: 11, background: "transparent", border: "0.5px solid #85B7EB", borderRadius: 6, color: "#0C447C", cursor: "pointer", padding: "2px 8px" }}>Clear</button>
        </div>
      )}

      {sessionType === "lift" && (
        <>
          {exercises.map((ex, i) => (
            <div key={i} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <input placeholder="Exercise name" value={ex.name} onChange={e => updateExerciseName(i, e.target.value)} style={{ flex: 1, fontWeight: 500 }} />
                {exercises.length > 1 && <button onClick={() => removeExercise(i)} aria-label="Remove exercise" style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 16 }}>✕</button>}
              </div>
              {ex.plannedReps && (
                <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 8px", fontStyle: "italic" }}>
                  Plan: {ex.plannedSets}×{ex.plannedReps}{ex.notes ? ` · ${ex.notes}` : ""}
                </p>
              )}
              {ex.sets.map((s, j) => {
                const isH = HEIGHT_EXERCISES.includes(ex.name?.toLowerCase().trim());
                const isLast = j === ex.sets.length - 1;
                return (
                  <div key={j} style={{ display: "flex", gap: 6, marginBottom: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 2 }}>
                      {j === 0 && <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 3px", fontWeight: 500 }}>{isH ? "Height (in)" : isDumbbellExercise(ex.name) ? "Weight (lb, both DBs)" : "Weight (lb)"}</p>}
                      <input type="number" inputMode="numeric" placeholder={isH ? "24" : "135"} value={s.weight} onChange={e => updateSet(i, j, "weight", e.target.value)} style={{ width: "100%", boxSizing: "border-box", textAlign: "center" }} />
                    </div>
                    <div style={{ flex: 2 }}>
                      {j === 0 && <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 3px", fontWeight: 500 }}>Reps</p>}
                      <input type="number" inputMode="numeric" placeholder="8" value={s.reps} onChange={e => updateSet(i, j, "reps", e.target.value)} style={{ width: "100%", boxSizing: "border-box", textAlign: "center" }} />
                    </div>

                    <button onClick={() => removeSet(i, j)} aria-label="Remove set" style={{ background: "transparent", border: "none", color: "var(--color-text-tertiary)", cursor: "pointer", fontSize: 13, padding: "0 0 6px", flexShrink: 0 }}>✕</button>
                  </div>
                );
              })}
              <button onClick={() => addSet(i)} style={{ fontSize: 12, color: "var(--color-text-secondary)", background: "transparent", border: "none", cursor: "pointer", padding: 0, marginTop: 4 }}>+ Add set</button>
            </div>
          ))}
          <button onClick={addExercise} style={{ border: "0.5px dashed var(--color-border-secondary)", borderRadius: 10, padding: "10px", width: "100%", background: "transparent", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 13, marginBottom: "1rem" }}>
            + Add exercise
          </button>
        </>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Notes</p>
        <textarea placeholder="How did it feel? Anything to note for next time?" value={notes} onChange={e => setNotes(e.target.value)}
          style={{ width: "100%", minHeight: 64, fontSize: 13, borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", padding: "8px 10px", boxSizing: "border-box", resize: "vertical" }} />
      </div>

      <button onClick={save} style={{ padding: "10px 20px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: saved ? "var(--color-background-success)" : "transparent", color: saved ? "var(--color-text-success)" : "var(--color-text-primary)", cursor: "pointer", fontSize: 14, fontWeight: 500 }}>
        {saved ? "✓ Saved" : "Save session"}
      </button>

      {workoutLogs.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Recent sessions</p>
          {workoutLogs.slice(0, 5).map(log => {
            const c = COLOR[log.type] || COLOR.other;
            return (
              <div key={log.id} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: "10px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{log.name || log.type}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{log.date} · {log.exercises?.length || 0} exercises</p>
                </div>
                <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6 }}>{log.type}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Progress({ workoutLogs }) {
  const [selectedExercise, setSelectedExercise] = useState("");
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const liftLogs = workoutLogs.filter(l => l.type === "lift");
  const allExercises = [...new Set(liftLogs.flatMap(l => l.exercises?.map(e => e.name).filter(Boolean) || []))].sort();

  useEffect(() => {
    if (!selectedExercise || !chartRef.current) return;
    const dataPoints = [];
    liftLogs.forEach(log => {
      log.exercises?.forEach(ex => {
        if (ex.name?.toLowerCase().trim() === selectedExercise.toLowerCase().trim()) {
          ex.sets?.forEach(s => {
            const w = parseFloat(s.weight), r = parseInt(s.reps);
            if (w && r) dataPoints.push({ date: log.date, weight: w, reps: r });
          });
        }
      });
    });
    dataPoints.sort((a, b) => a.date.localeCompare(b.date));
    const maxByDate = {};
    dataPoints.forEach(p => { if (!maxByDate[p.date] || p.weight > maxByDate[p.date]) maxByDate[p.date] = p.weight; });
    const labels = Object.keys(maxByDate);
    const vals = Object.values(maxByDate);
    if (chartInstance.current) chartInstance.current.destroy();
    chartInstance.current = new Chart(chartRef.current, {
      type: "line",
      data: { labels, datasets: [{ label: "Max weight (lb)", data: vals, borderColor: "#378ADD", backgroundColor: "#E6F1FB", pointRadius: 5, tension: 0.3, fill: true }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#888780", font: { size: 11 } }, grid: { color: "rgba(136,135,128,0.15)" } },
          y: { ticks: { color: "#888780", font: { size: 11 }, callback: v => `${Math.round(v)}lb` }, grid: { color: "rgba(136,135,128,0.15)" } }
        }
      }
    });
    return () => { if (chartInstance.current) { chartInstance.current.destroy(); chartInstance.current = null; } };
  }, [selectedExercise, workoutLogs]);

  const totalSessions = workoutLogs.length;
  const liftSessions = liftLogs.length;
  const thisWeek = workoutLogs.filter(l => { const d = new Date(l.date + "T00:00:00"); const diff = (new Date() - d) / 86400000; return diff <= 7; }).length;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: "1.5rem" }}>
        {[["Total sessions", totalSessions], ["Lift sessions", liftSessions], ["This week", thisWeek]].map(([label, val]) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "0.75rem 1rem" }}>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>{label}</p>
            <p style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{val}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Strength progression</p>
      {allExercises.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Log some lifting sessions to see your progress charts here.</p>
      ) : (
        <>
          <select value={selectedExercise} onChange={e => setSelectedExercise(e.target.value)} style={{ marginBottom: 16, maxWidth: 280 }}>
            <option value="">Select an exercise</option>
            {allExercises.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          {selectedExercise && (
            <div style={{ position: "relative", width: "100%", height: 240 }}>
              <canvas ref={chartRef} role="img" aria-label={`Weight progression chart for ${selectedExercise}`}></canvas>
            </div>
          )}
        </>
      )}
      {totalSessions > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Sessions by type</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(workoutLogs.reduce((acc, l) => { acc[l.type] = (acc[l.type] || 0) + 1; return acc; }, {})).map(([type, count]) => {
              const c = COLOR[type] || COLOR.other;
              return (
                <div key={type} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", minWidth: 70 }}>{type}</span>
                  <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 4, height: 10, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round((count / totalSessions) * 100)}%`, background: c.bg, borderRadius: 4, height: "100%", border: `0.5px solid ${c.text}` }} />
                  </div>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)", minWidth: 20 }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Records({ prs }) {
  const entries = Object.values(prs).sort((a, b) => a.exerciseName?.localeCompare(b.exerciseName));
  return (
    <div>
      <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Personal records</p>
      {entries.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>PRs are automatically tracked when you log lifting sessions. Start logging to see your records here.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {entries.map(pr => (
            <div key={pr.exerciseName} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "0.75rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500 }}>{pr.exerciseName}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>Set on {pr.date}</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 500 }}>{pr.weight} {pr.isHeight ? "in" : "lb"}</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-secondary)" }}>{pr.reps} reps</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Settings({ fixedActivities, setFixedActivities }) {
  const [name, setName] = useState("");
  const [day, setDay] = useState("Monday");
  const [type, setType] = useState("class");
  const [time, setTime] = useState("");

  const add = () => {
    if (!name.trim()) return;
    setFixedActivities([...fixedActivities, { id: Date.now(), name, day, type, time }]);
    setName(""); setTime("");
  };
  const remove = id => setFixedActivities(fixedActivities.filter(a => a.id !== id));

  const exportData = () => {
    const dump = {};
    Object.values(STORAGE_KEYS).forEach(k => {
      const v = localStorage.getItem(k);
      if (v != null) dump[k] = JSON.parse(v);
    });
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workout-backup-" + toLocalDateStr(new Date()) + ".json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dump = JSON.parse(reader.result);
        Object.entries(dump).forEach(([k, v]) => {
          if (Object.values(STORAGE_KEYS).includes(k)) {
            localStorage.setItem(k, JSON.stringify(v));
          }
        });
        alert("Backup imported. Reload the app to see your restored data.");
      } catch (e) {
        alert("Could not import that file: " + e.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 13, fontWeight: 500, margin: "0 0 4px" }}>Backup and restore</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 10px" }}>Your data lives in this browser. Export a backup file periodically so you never lose your history.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={exportData} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", cursor: "pointer", fontSize: 13 }}>
            Export data
          </button>
          <label style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", cursor: "pointer", fontSize: 13 }}>
            Import backup
            <input type="file" accept="application/json" onChange={e => e.target.files[0] && importData(e.target.files[0])} style={{ display: "none" }} />
          </label>
        </div>
      </div>
      <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Fixed weekly activities</p>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1rem" }}>These are included automatically when Claude generates your weekly plan.</p>
      <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Activity name</p>
            <input placeholder="Reformer Pilates" value={name} onChange={e => setName(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
          <div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Day</p>
            <select value={day} onChange={e => setDay(e.target.value)} style={{ width: "100%" }}>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Type</p>
            <select value={type} onChange={e => setType(e.target.value)} style={{ width: "100%" }}>
              <option value="class">Class</option>
              <option value="sport">Sport</option>
              <option value="recovery">Recovery</option>
              <option value="lift">Lifting</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 4px" }}>Time (optional)</p>
            <input placeholder="7:00 AM" value={time} onChange={e => setTime(e.target.value)} style={{ width: "100%", boxSizing: "border-box" }} />
          </div>
        </div>
        <button onClick={add} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--color-border-secondary)", background: "transparent", color: "var(--color-text-primary)", cursor: "pointer", fontSize: 13 }}>
          + Add activity
        </button>
      </div>
      {fixedActivities.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>No fixed activities yet. Add things like Pilates, contrast therapy, or recurring training sessions.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {fixedActivities.map(a => {
            const c = COLOR[a.type] || COLOR.other;
            return (
              <div key={a.id} style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 10, padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ background: c.bg, color: c.text, fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 6 }}>{a.type}</span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{a.name}</span>
                <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{a.day}{a.time ? ` · ${a.time}` : ""}</span>
                <button onClick={() => remove(a.id)} aria-label="Remove" style={{ background: "transparent", border: "none", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: 16 }}>
                  🗑
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
