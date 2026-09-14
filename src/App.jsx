import { useState, useEffect, useRef } from "react";

import { C } from "./theme";
import WeeklyChart, { RangeToggle } from "./WeeklyChart";

const STORAGE_KEY = "habit-ledger-v1";
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const HABITS = [
  { id: "exercise", name: "Exercise", meta: "4× a week, any days", type: "toggle", target: 4 },
  { id: "spanish", name: "Spanish", meta: "every day", type: "toggle", target: 7 },
  { id: "papers", name: "Core papers", meta: "3 a day · each tap logs one", type: "count", per: 3, target: 21 },
  { id: "discord", name: "Discord paper sweep", meta: "weekdays only", type: "toggle", target: 5, weekdaysOnly: true },
  { id: "writing", name: "Writing practice", meta: "3× a week, any days", type: "toggle", target: 3 },
];

// ---------- date helpers (local time, Monday start) ----------
function pad(n) { return String(n).padStart(2, "0"); }
function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function monthKeyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function rangeLabel(monday) {
  const sun = addDays(monday, 6);
  const a = `${MONTHS[monday.getMonth()]} ${monday.getDate()}`;
  const b = monday.getMonth() === sun.getMonth() ? `${sun.getDate()}` : `${MONTHS[sun.getMonth()]} ${sun.getDate()}`;
  return `${a} – ${b}`;
}

// ---------- data helpers ----------
function emptyWeek() {
  const w = {};
  for (const h of HABITS) w[h.id] = h.type === "count" ? [0, 0, 0, 0, 0, 0, 0] : [false, false, false, false, false, false, false];
  return w;
}
function normalizeWeek(w) {
  const fixed = emptyWeek();
  if (w && typeof w === "object") {
    for (const h of HABITS) {
      if (Array.isArray(w[h.id]) && w[h.id].length === 7) fixed[h.id] = w[h.id];
    }
  }
  return fixed;
}
function habitDone(week, h) {
  const arr = week[h.id] || [];
  return h.type === "count" ? arr.reduce((a, b) => a + (Number(b) || 0), 0) : arr.filter(Boolean).length;
}
function weekPct(week) {
  let s = 0;
  for (const h of HABITS) s += Math.min(habitDone(week, h) / h.target, 1);
  return Math.round((s / HABITS.length) * 100);
}
// One point per week, oldest first, for the outcomes chart and the past-weeks list.
// Weeks before the ledger's first record have pct null; a missed week since then scores 0.
function buildSeries(data, monday, weekKey, count) {
  const firstKey = Object.keys(data.weeks).sort()[0];
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addDays(monday, -7 * i);
    const k = keyOf(m);
    const week = normalizeWeek(data.weeks[k]);
    const beforeStart = !firstKey || k < firstKey;
    out.push({
      key: k,
      monday: m,
      label: rangeLabel(m),
      pct: beforeStart ? null : weekPct(week),
      inProgress: k === weekKey,
      habits: HABITS.map((h) => {
        const done = habitDone(week, h);
        return { id: h.id, name: h.name, done, target: h.target, hit: done >= h.target };
      }),
    });
  }
  return out;
}

// ---------- localStorage (replaces the Claude artifact window.storage API) ----------
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* private browsing or corrupted data: start fresh */ }
  return { weeks: {}, months: {} };
}
function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export default function App() {
  const today = new Date();
  const monday = mondayOf(today);
  const weekKey = keyOf(monday);
  const monthKey = monthKeyOf(today);
  const todayIdx = (today.getDay() + 6) % 7;

  const [data, setData] = useState(null); // { weeks:{}, months:{} }
  const [status, setStatus] = useState("loading"); // loading | saved | saving | error
  const [armErase, setArmErase] = useState(false);
  const [range, setRange] = useState(12); // weeks shown in the chart + past-weeks list
  const [viewBack, setViewBack] = useState(0); // 0 = this week; 1+ = weeks back (retro logging)
  const saveTimer = useRef(null);
  const loadedRef = useRef(false);

  // The sheet shows and edits the viewed week; by default that's the current one.
  const viewMonday = addDays(monday, -7 * viewBack);
  const viewKey = keyOf(viewMonday);
  const viewingCurrent = viewBack === 0;

  // ----- load once -----
  useEffect(() => {
    let d = loadData();
    if (!d || typeof d !== "object") d = { weeks: {}, months: {} };
    d.weeks = d.weeks || {};
    d.months = d.months || {};
    d.weeks[weekKey] = normalizeWeek(d.weeks[weekKey]);
    if (typeof d.months[monthKey] !== "number") d.months[monthKey] = 0;
    loadedRef.current = true;
    setData(d);
    setStatus("saved");
  }, []); // eslint-disable-line

  // ----- debounced save on change -----
  useEffect(() => {
    if (!loadedRef.current || !data) return;
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setStatus(saveData(data) ? "saved" : "error");
    }, 400);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
  }, [data]);

  // ----- updates -----
  function updateWeek(habitId, dayIdx) {
    setData((prev) => {
      const next = { ...prev, weeks: { ...prev.weeks } };
      const week = { ...normalizeWeek(next.weeks[viewKey]) };
      const h = HABITS.find((x) => x.id === habitId);
      const arr = [...week[habitId]];
      arr[dayIdx] = h.type === "count" ? (Number(arr[dayIdx]) + 1) % (h.per + 1) : !arr[dayIdx];
      week[habitId] = arr;
      next.weeks[viewKey] = week;
      return next;
    });
  }
  function bumpBooks(delta) {
    setData((prev) => {
      const next = { ...prev, months: { ...prev.months } };
      next.months[monthKey] = Math.max(0, (next.months[monthKey] || 0) + delta);
      return next;
    });
  }
  function eraseAll() {
    if (!armErase) { setArmErase(true); setTimeout(() => setArmErase(false), 4000); return; }
    setArmErase(false);
    setData({ weeks: { [weekKey]: emptyWeek() }, months: { [monthKey]: 0 } });
  }

  // ----- loading screen -----
  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontFamily: "system-ui, sans-serif" }}>
        Opening your week…
      </div>
    );
  }

  const week = normalizeWeek(data.weeks[viewKey]);
  const pct = weekPct(week);
  const books = data.months[monthKey] || 0;
  const series = buildSeries(data, monday, weekKey, range);
  const pastWeeks = series.filter((p) => !p.inProgress && p.pct !== null).reverse();

  const statusText =
    status === "saving" ? "Saving…" :
    status === "saved" ? "Saved on this device" :
    status === "error" ? "Couldn't save (private browsing?) — changes kept for this session" : "";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", padding: "20px 14px 48px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&display=swap');
        .frn { font-family: 'Fraunces', Georgia, serif; }
        .cell:focus-visible, .btn:focus-visible { outline: 2px solid ${C.amber}; outline-offset: 2px; }
        .cell { transition: transform 80ms ease; }
        .cell:active { transform: scale(0.9); }
        @media (prefers-reduced-motion: reduce) { .cell { transition: none; } .cell:active { transform: none; } }
      `}</style>

      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        {/* ---------- header ---------- */}
        <header style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div className="frn" style={{ fontSize: 30, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.1 }}>
              Week of {rangeLabel(viewMonday)}
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button className="btn" aria-label="Previous week" disabled={viewBack >= 52}
                onClick={() => setViewBack((v) => Math.min(52, v + 1))}
                style={{ width: 34, height: 34, borderRadius: 10, border: `1.5px solid ${C.line}`, background: C.sheet, color: C.ink, fontSize: 17, padding: 0, cursor: viewBack >= 52 ? "default" : "pointer", opacity: viewBack >= 52 ? 0.4 : 1 }}>‹</button>
              <button className="btn" aria-label="Next week" disabled={viewingCurrent}
                onClick={() => setViewBack((v) => Math.max(0, v - 1))}
                style={{ width: 34, height: 34, borderRadius: 10, border: `1.5px solid ${C.line}`, background: C.sheet, color: C.ink, fontSize: 17, padding: 0, cursor: viewingCurrent ? "default" : "pointer", opacity: viewingCurrent ? 0.4 : 1 }}>›</button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.line, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: pct >= 80 ? C.amber : C.ink, borderRadius: 3 }} />
            </div>
            <div className="frn" style={{ fontSize: 15, fontWeight: 650, minWidth: 42, textAlign: "right" }}>{pct}%</div>
          </div>
          <div style={{ fontSize: 12, color: C.faint, marginTop: 6, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {viewingCurrent ? (
              "Tap a day to log it · 80% is a great week"
            ) : (
              <>
                <span style={{ color: C.ink, fontWeight: 600 }}>Editing a past week — taps save to it</span>
                <button className="btn" onClick={() => setViewBack(0)}
                  style={{ fontSize: 12, color: C.ink, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                  Back to this week
                </button>
              </>
            )}
          </div>
        </header>

        {/* ---------- habit sheet ---------- */}
        <section style={{ background: C.sheet, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden" }}>
          {/* day strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", padding: "10px 14px 8px", borderBottom: `1px solid ${C.line}` }}>
            {DAY_LETTERS.map((L, i) => {
              const d = addDays(viewMonday, i);
              const isToday = viewingCurrent && i === todayIdx;
              return (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 500, color: isToday ? C.amber : C.faint }}>{L}</div>
                  <div style={{ fontSize: 11, color: isToday ? C.ink : C.faint, fontWeight: isToday ? 700 : 400 }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {HABITS.map((h, hi) => {
            const done = habitDone(week, h);
            const hit = done >= h.target;
            return (
              <div key={h.id} style={{ padding: "12px 14px 14px", borderTop: hi > 0 ? `1px solid ${C.line}` : "none" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                  <div>
                    <span style={{ fontSize: 14.5, fontWeight: 600 }}>{h.name}</span>
                    <span style={{ fontSize: 12, color: C.faint, marginLeft: 8 }}>{h.meta}</span>
                  </div>
                  <span className="frn" style={{ fontSize: 14, fontWeight: 650, color: hit ? C.amber : C.ink, whiteSpace: "nowrap" }}>
                    {done}/{h.target}{hit ? " ✓" : ""}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", justifyItems: "center" }}>
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                    if (h.weekdaysOnly && i > 4) {
                      return <div key={i} aria-hidden="true" style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", color: C.line, fontSize: 13 }}>—</div>;
                    }
                    const isToday = viewingCurrent && i === todayIdx;
                    const future = viewingCurrent && i > todayIdx;
                    const ring = isToday ? `0 0 0 2px ${C.sheet}, 0 0 0 4px ${C.amber}` : "none";
                    if (h.type === "count") {
                      const v = Number(week[h.id][i]) || 0;
                      const fill = (v / h.per) * 100;
                      return (
                        <button
                          key={i} className="cell"
                          aria-label={`${h.name}, ${DAY_LETTERS[i]}: ${v} of ${h.per} logged. Tap to add one.`}
                          onClick={() => updateWeek(h.id, i)}
                          style={{
                            width: 34, height: 34, borderRadius: "50%", cursor: "pointer",
                            border: `1.5px solid ${v > 0 ? C.ink : C.line}`,
                            background: v > 0 ? `conic-gradient(${C.ink} ${fill}%, transparent ${fill}% 100%)` : C.sheet,
                            boxShadow: ring, opacity: future && v === 0 ? 0.45 : 1, padding: 0,
                          }}
                        />
                      );
                    }
                    const on = !!week[h.id][i];
                    return (
                      <button
                        key={i} className="cell"
                        aria-label={`${h.name}, ${DAY_LETTERS[i]}: ${on ? "done" : "not done"}. Tap to change.`}
                        onClick={() => updateWeek(h.id, i)}
                        style={{
                          width: 34, height: 34, borderRadius: "50%", cursor: "pointer",
                          border: `1.5px solid ${on ? C.ink : C.line}`,
                          background: on ? C.ink : C.sheet,
                          boxShadow: ring, opacity: future && !on ? 0.45 : 1, padding: 0,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>

        {/* ---------- books (monthly) ---------- */}
        <section style={{ background: C.sheet, border: `1px solid ${C.line}`, borderRadius: 14, marginTop: 14, padding: "14px 14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>Books</span>
              <span style={{ fontSize: 12, color: C.faint, marginLeft: 8 }}>2 in {MONTHS_FULL[today.getMonth()]} · resets monthly</span>
            </div>
            <span className="frn" style={{ fontSize: 14, fontWeight: 650, color: books >= 2 ? C.amber : C.ink }}>
              {books}/2{books >= 2 ? " ✓" : ""}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {[0, 1].map((i) => (
                <div key={i} style={{
                  width: 34, height: 46, borderRadius: 6,
                  border: `1.5px solid ${books > i ? C.ink : C.line}`,
                  background: books > i ? C.ink : C.sheet,
                }} />
              ))}
              {books > 2 && <span style={{ fontSize: 12, color: C.amber, fontWeight: 600 }}>+{books - 2} extra</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" aria-label="Remove one finished book" onClick={() => bumpBooks(-1)}
                style={{ width: 38, height: 38, borderRadius: 10, border: `1.5px solid ${C.line}`, background: C.sheet, color: C.ink, fontSize: 18, cursor: "pointer" }}>−</button>
              <button className="btn" aria-label="Log one finished book" onClick={() => bumpBooks(1)}
                style={{ width: 38, height: 38, borderRadius: 10, border: `1.5px solid ${C.ink}`, background: C.ink, color: C.sheet, fontSize: 18, cursor: "pointer" }}>+</button>
            </div>
          </div>
        </section>

        {/* ---------- range filter: scopes the chart and the past-weeks list below ---------- */}
        <RangeToggle value={range} onChange={setRange} />

        {/* ---------- weekly outcomes chart ---------- */}
        <section style={{ background: C.sheet, border: `1px solid ${C.line}`, borderRadius: 14, marginTop: 10, padding: "14px 14px 10px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "0 8px", marginBottom: 8 }}>
            <span style={{ fontSize: 14.5, fontWeight: 600 }}>Weekly outcomes</span>
            <span style={{ fontSize: 12, color: C.faint }}>score per week · amber line is 80%</span>
          </div>
          <WeeklyChart
            series={series}
            hint={pastWeeks.length === 0
              ? "Your first full week files here on Monday. Tap a column for its habit-by-habit breakdown."
              : "Tap or hover a column for its habit-by-habit breakdown."}
          />
        </section>

        {/* ---------- past weeks (table view of the chart) ---------- */}
        <section style={{ background: C.sheet, border: `1px solid ${C.line}`, borderRadius: 14, marginTop: 14, padding: "14px 14px 6px" }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, marginBottom: 6 }}>Past weeks</div>
          {pastWeeks.length === 0 ? (
            <div style={{ fontSize: 12.5, color: C.faint, padding: "4px 0 10px" }}>
              Finish this week and it'll be filed here — the board starts fresh every Monday on its own.
            </div>
          ) : (
            pastWeeks.map((p) => (
              <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: `1px solid ${C.line}` }}>
                <div style={{ fontSize: 12.5, color: C.faint, width: 92 }}>{p.label}</div>
                <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.line, overflow: "hidden" }}>
                  <div style={{ width: `${p.pct}%`, height: "100%", background: p.pct >= 80 ? C.amber : C.ink }} />
                </div>
                <div className="frn" style={{ fontSize: 13, fontWeight: 650, width: 40, textAlign: "right", color: p.pct >= 80 ? C.amber : C.ink }}>{p.pct}%</div>
              </div>
            ))
          )}
        </section>

        {/* ---------- footer ---------- */}
        <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, padding: "0 2px" }}>
          <span style={{ fontSize: 11.5, color: status === "error" ? "#B4552D" : C.faint }}>{statusText}</span>
          <button className="btn" onClick={eraseAll}
            style={{ fontSize: 11.5, color: armErase ? "#B4552D" : C.faint, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 4 }}>
            {armErase ? "Tap again to erase everything" : "Erase all data"}
          </button>
        </footer>
      </div>
    </div>
  );
}
