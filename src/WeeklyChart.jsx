import { useEffect, useRef, useState } from "react";
import { C } from "./theme";

// Weekly outcomes: one column per week, score 0–100%, single series.
// Ink = a finished week, amber = a finished week at or above the 80% target,
// gray = the week in progress. Hover, tap, or focus a column and the readout
// under the chart shows that week's habit-by-habit breakdown. The "Past weeks"
// list in App.jsx is the table view of the same numbers.

const TARGET = 80;
const PLOT_H = 140;
const M = { top: 18, right: 10, bottom: 32, left: 34 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tabular = { fontVariantNumeric: "tabular-nums" };

function useWidth(ref, fallback = 420) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth || fallback);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fallback]);
  return w;
}

// Column with 4px-rounded data end and a square baseline.
function barPath(x, top, w, bottom) {
  const h = bottom - top;
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${bottom} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${bottom} Z`;
}

function describe(p) {
  if (p.pct === null) return `${p.label}: before your ledger began.`;
  const hits = p.habits.filter((h) => h.hit).length;
  const state = p.inProgress ? "in progress" : p.pct >= TARGET ? "great week" : "finished";
  return `${p.label}: ${p.pct}%, ${state}. ${hits} of ${p.habits.length} habits hit.`;
}

export function RangeToggle({ value, onChange }) {
  const opts = [[12, "12 wk"], [26, "26 wk"], [52, "52 wk"]];
  return (
    <div role="group" aria-label="Weeks shown in the chart and list" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, padding: "0 2px" }}>
      <span style={{ fontSize: 12, color: C.faint, marginRight: 4 }}>Show</span>
      {opts.map(([v, l]) => {
        const on = v === value;
        return (
          <button key={v} className="btn" aria-pressed={on} onClick={() => onChange(v)}
            style={{
              fontSize: 12, fontWeight: on ? 650 : 500, padding: "5px 11px", borderRadius: 999, cursor: "pointer",
              border: `1.5px solid ${on ? C.ink : C.line}`, background: on ? C.ink : C.sheet, color: on ? C.sheet : C.ink,
            }}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

// The readout lives under the plot instead of floating over it, so it never
// covers columns, never clips at the card edge, and stays put after a tap.
function Readout({ p, hint }) {
  const box = { minHeight: 46, padding: "6px 0 2px", fontSize: 12, color: C.faint, lineHeight: 1.4 };
  if (!p) return <div style={box}>{hint}</div>;
  const badge = p.inProgress ? "in progress" : p.pct >= TARGET ? "great week" : null;
  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span className="frn" style={{ fontSize: 17, fontWeight: 650, color: C.ink, lineHeight: 1 }}>{p.pct}%</span>
        <span style={{ fontWeight: 600, color: C.ink }}>{p.label}</span>
        {badge && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: p.inProgress ? C.mute : C.amber, display: "inline-block" }} />
            {badge}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "1px 14px", marginTop: 3 }}>
        {p.habits.map((h) => (
          <span key={h.id} style={{ whiteSpace: "nowrap" }}>
            <span style={{ fontWeight: 650, color: C.ink, ...tabular }}>{h.done}/{h.target}{h.hit ? " ✓" : ""}</span>
            {" "}{h.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function WeeklyChart({ series, hint }) {
  const wrapRef = useRef(null);
  const width = useWidth(wrapRef);
  const [hover, setHover] = useState(null);   // transient: pointer or keyboard focus
  const [pinned, setPinned] = useState(null); // sticky: tap / click / Enter
  const active = hover ?? pinned;

  // Columns shift when the range changes, so a pinned index would point at another week.
  useEffect(() => { setPinned(null); setHover(null); }, [series.length]);

  const n = Math.max(1, series.length);
  const innerW = Math.max(60, width - M.left - M.right);
  const slot = innerW / n;
  const barW = Math.max(2, Math.min(24, slot - 4));
  const H = M.top + PLOT_H + M.bottom;
  const y = (v) => M.top + PLOT_H - (v / 100) * PLOT_H;
  const slotX = (i) => M.left + i * slot;
  const barX = (i) => slotX(i) + (slot - barW) / 2;
  const cx = (i) => slotX(i) + slot / 2;
  const dense = slot < 30;      // too tight for adjacent value labels
  const showDays = slot >= 14;  // room for a day-of-month under every column

  // Selective direct labels: the latest finished week, the best finished week, and (when roomy) this week.
  const finished = series.map((p, i) => ({ p, i })).filter(({ p }) => !p.inProgress && p.pct !== null);
  const last = finished.length ? finished[finished.length - 1] : null;
  const best = finished.length ? finished.reduce((a, b) => (b.p.pct > a.p.pct ? b : a)) : null;
  const cur = series.findIndex((p) => p.inProgress);
  const labelIdx = new Set();
  if (last) labelIdx.add(last.i);
  if (best && best.i !== last.i && (!dense || Math.abs(best.i - last.i) > 1)) labelIdx.add(best.i);
  if (cur >= 0 && !dense) labelIdx.add(cur);

  const activePt = active !== null ? series[active] ?? null : null;
  const togglePin = (i) => setPinned((cur) => (cur === i ? null : i));

  return (
    <div ref={wrapRef} style={{ width: "100%" }} onPointerLeave={() => setHover(null)}>
      <svg width={width} height={H} role="group" aria-label="Weekly outcomes: percent of habits completed, one column per week" style={{ display: "block", overflow: "visible" }}>
        {/* hover / focus / pinned band */}
        {active !== null && <rect x={slotX(active)} y={M.top} width={slot} height={PLOT_H} fill={C.bg} />}

        {/* gridlines + y ticks (hairline, solid, recessive) */}
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + innerW} y1={y(v)} y2={y(v)} stroke={C.line} strokeWidth={1} shapeRendering="crispEdges" />
            <text x={M.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={C.mute} style={tabular}>
              {v === 100 ? "100%" : v}
            </text>
          </g>
        ))}

        {/* 80% target */}
        <line x1={M.left} x2={M.left + innerW} y1={y(TARGET)} y2={y(TARGET)} stroke={C.amber} strokeWidth={1} shapeRendering="crispEdges" />
        <text x={M.left - 6} y={y(TARGET)} textAnchor="end" dominantBaseline="middle" fontSize={10} fontWeight={700} fill={C.ink} style={tabular}>
          {TARGET}
        </text>

        {/* columns */}
        {series.map((p, i) => {
          if (p.pct === null) return null;
          const top = y(p.pct);
          const bottom = y(0);
          const fill = p.inProgress ? C.mute : p.pct >= TARGET ? C.amber : C.ink;
          return (
            <g key={p.key}>
              {p.pct > 0
                ? <path d={barPath(barX(i), top, barW, bottom)} fill={fill} opacity={active === i ? 0.72 : 1} />
                : <rect x={barX(i)} y={bottom - 2} width={barW} height={2} fill={C.line} />}
              {labelIdx.has(i) && p.pct > 0 && (
                <text x={cx(i)} y={top - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill={p.inProgress ? C.mute : C.ink} style={tabular}>
                  {p.pct}%
                </text>
              )}
            </g>
          );
        })}

        {/* x axis: day-of-month per week (when it fits) + month at each month change */}
        {series.map((p, i) => {
          const prev = series[i - 1];
          const newMonth = !prev || prev.monday.getMonth() !== p.monday.getMonth();
          const dayColor = p.pct === null ? C.line : C.mute;
          return (
            <g key={p.key}>
              {showDays && (
                <text x={cx(i)} y={y(0) + 13} textAnchor="middle" fontSize={10} fill={dayColor} style={tabular}>{p.monday.getDate()}</text>
              )}
              {newMonth && (
                <text x={showDays ? cx(i) : slotX(i) + 1} y={y(0) + (showDays ? 26 : 14)} textAnchor={showDays ? "middle" : "start"} fontSize={10} fontWeight={600} fill={C.mute}>
                  {MONTHS[p.monday.getMonth()]}
                </text>
              )}
            </g>
          );
        })}

        {/* hit targets: the whole slot, taller than the plot; keyboard-focusable, tap to pin */}
        {series.map((p, i) => {
          const live = p.pct !== null;
          return (
            <rect key={p.key} x={slotX(i)} y={M.top - 8} width={slot} height={PLOT_H + 8 + 14} fill="transparent"
              tabIndex={live ? 0 : -1} role="button" aria-pressed={pinned === i} aria-label={describe(p)}
              onPointerEnter={live ? () => setHover(i) : undefined}
              onFocus={live ? () => setHover(i) : undefined}
              onBlur={() => setHover(null)}
              onClick={live ? () => togglePin(i) : undefined}
              onKeyDown={live ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePin(i); } } : undefined}
              style={{ outline: "none", cursor: live ? "pointer" : "default" }} />
          );
        })}
      </svg>

      <Readout p={activePt} hint={hint} />
    </div>
  );
}
