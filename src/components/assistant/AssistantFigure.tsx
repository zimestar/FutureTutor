import { useId, type ReactNode } from "react";
import { z } from "zod";

/**
 * ASSISTANT-2 — figures drawn by FutureTutor from a small JSON description
 * written by the assistant inside a ```figure block. The model never writes
 * SVG or code: it only names a figure type and its labels, which are rendered
 * as React text (escaped). Anything that does not validate is dropped.
 */
const label = z.string().trim().max(24);
const optLabel = label.nullish();
const num = z.number().finite();

const Triangle = z.object({
  type: z.literal("triangle"),
  vertices: z.array(label).length(3).optional(),
  sides: z.array(optLabel).length(3).optional(), // AB, BC, CA
  angles: z.array(optLabel).length(3).optional(), // at A, B, C
  lengths: z.array(num.positive().max(1000)).length(3).optional(), // AB, BC, CA, for the proportions
  rightAngleAt: z.number().int().min(0).max(2).optional(),
});
const Rectangle = z.object({
  type: z.literal("rectangle"),
  width: num.positive().max(1000).optional(),
  height: num.positive().max(1000).optional(),
  widthLabel: optLabel,
  heightLabel: optLabel,
});
const Circle = z.object({ type: z.literal("circle"), radiusLabel: optLabel, diameter: z.boolean().optional(), centerLabel: optLabel });
const NumberLine = z.object({
  type: z.literal("numberLine"),
  min: num.min(-1000),
  max: num.max(1000),
  step: num.positive().optional(),
  points: z.array(z.object({ value: num, label: optLabel })).max(8).default([]),
  segment: z.object({ from: num, to: num }).optional(),
});
const FractionBars = z.object({
  type: z.literal("fractionBars"),
  bars: z.array(z.object({ parts: z.number().int().min(1).max(24), shaded: z.number().int().min(0).max(24), label: optLabel })).min(1).max(6),
});
const Graph = z.object({
  type: z.literal("graph"),
  xMin: num.min(-50).default(-10),
  xMax: num.max(50).default(10),
  yMin: num.min(-50).default(-10),
  yMax: num.max(50).default(10),
  lines: z.array(z.object({ slope: num, intercept: num, label: optLabel })).max(4).default([]),
  points: z.array(z.object({ x: num, y: num, label: optLabel })).max(8).default([]),
});

export const FigureSpec = z.discriminatedUnion("type", [Triangle, Rectangle, Circle, NumberLine, FractionBars, Graph]);
export type FigureSpec = z.infer<typeof FigureSpec>;

export function parseFigure(raw: string): FigureSpec | null {
  try {
    const result = FigureSpec.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

const INK = "#0d1b2a";
const BLUE = "#2563eb";
const CORAL = "#ff7a59";
const LILAC = "#8b7cf6";
const MUTED = "#94a3b8";

type P = { x: number; y: number };

function Label({ at, children, color = INK, size = 15, anchor = "middle" }: { at: P; children: string; color?: string; size?: number; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={at.x} y={at.y} fill={color} fontSize={size} fontWeight={700} textAnchor={anchor} dominantBaseline="middle" fontFamily="inherit">
      {children}
    </text>
  );
}

/** Fits model-space points into a viewBox with a margin; y grows upward. */
function fit(points: P[], width: number, height: number, margin: number) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = Math.min((width - 2 * margin) / (maxX - minX || 1), (height - 2 * margin) / (maxY - minY || 1));
  const offX = (width - (maxX - minX) * scale) / 2;
  const offY = (height - (maxY - minY) * scale) / 2;
  return (p: P): P => ({ x: offX + (p.x - minX) * scale, y: height - (offY + (p.y - minY) * scale) });
}

function away(from: P, origin: P, distance: number): P {
  const dx = from.x - origin.x;
  const dy = from.y - origin.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * distance, y: from.y + (dy / len) * distance };
}

/** Puts a side label just outside the side, anchored away from the shape so it never covers the line. */
function sidePlacement(mid: P, center: P): { at: P; anchor: "start" | "middle" | "end" } {
  const dx = mid.x - center.x;
  const dy = mid.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const [ux, uy] = [dx / len, dy / len];
  const anchor = ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle";
  return { at: { x: mid.x + ux * 12, y: mid.y + uy * 16 }, anchor };
}

function trianglePoints(spec: z.infer<typeof Triangle>): P[] {
  const l = spec.lengths;
  if (l) {
    const [ab, bc, ca] = l;
    if (ab + bc > ca && bc + ca > ab && ca + ab > bc) {
      const cx = (ab * ab + ca * ca - bc * bc) / (2 * ab);
      return [{ x: 0, y: 0 }, { x: ab, y: 0 }, { x: cx, y: Math.sqrt(Math.max(ca * ca - cx * cx, 0)) }];
    }
  }
  if (spec.rightAngleAt === 0) return [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }];
  if (spec.rightAngleAt === 1) return [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }];
  if (spec.rightAngleAt === 2) return [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 1.8, y: 2.4 }];
  return [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 1.7, y: 3.2 }];
}

function TriangleFigure({ spec }: { spec: z.infer<typeof Triangle> }) {
  const W = 360;
  const H = 260;
  const map = fit(trianglePoints(spec), W, H, 48);
  const pts = trianglePoints(spec).map(map);
  const center = { x: (pts[0].x + pts[1].x + pts[2].x) / 3, y: (pts[0].y + pts[1].y + pts[2].y) / 3 };
  const names = spec.vertices ?? ["A", "B", "C"];
  const sides = spec.sides ?? [null, null, null];
  const angles = spec.angles ?? [null, null, null];
  const pairs: [number, number][] = [[0, 1], [1, 2], [2, 0]];
  let rightMark: string | null = null;
  if (spec.rightAngleAt !== undefined) {
    const v = pts[spec.rightAngleAt];
    const a = pts[(spec.rightAngleAt + 1) % 3];
    const b = pts[(spec.rightAngleAt + 2) % 3];
    const unit = (to: P) => {
      const len = Math.hypot(to.x - v.x, to.y - v.y) || 1;
      return { x: ((to.x - v.x) / len) * 16, y: ((to.y - v.y) / len) * 16 };
    };
    const [ua, ub] = [unit(a), unit(b)];
    rightMark = `M ${v.x + ua.x} ${v.y + ua.y} L ${v.x + ua.x + ub.x} ${v.y + ua.y + ub.y} L ${v.x + ub.x} ${v.y + ub.y}`;
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[360px]">
      <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="#eff5ff" stroke={BLUE} strokeWidth={3} strokeLinejoin="round" />
      {rightMark && <path d={rightMark} fill="none" stroke={CORAL} strokeWidth={2.5} />}
      {pts.map((p, i) => (
        <Label key={`v${i}`} at={away(p, center, 22)}>{names[i] ?? ""}</Label>
      ))}
      {pairs.map(([i, j], k) =>
        sides[k] ? (
          <Label key={`s${k}`} {...sidePlacement({ x: (pts[i].x + pts[j].x) / 2, y: (pts[i].y + pts[j].y) / 2 }, center)} color={BLUE} size={14}>
            {sides[k] as string}
          </Label>
        ) : null
      )}
      {pts.map((p, i) =>
        angles[i] ? (
          <Label key={`a${i}`} at={away(p, center, spec.rightAngleAt === i ? -50 : -36)} color={CORAL} size={13}>
            {angles[i] as string}
          </Label>
        ) : null
      )}
    </svg>
  );
}

function RectangleFigure({ spec }: { spec: z.infer<typeof Rectangle> }) {
  const ratio = spec.width && spec.height ? Math.min(Math.max(spec.width / spec.height, 0.4), 3) : 1.6;
  const H = 220;
  const W = 360;
  const h = Math.min(140, 260 / ratio);
  const w = h * ratio;
  const x = (W - w) / 2;
  const y = (H - h) / 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full max-w-[360px]">
      <rect x={x} y={y} width={w} height={h} rx={4} fill="#fff8e1" stroke={BLUE} strokeWidth={3} />
      {spec.widthLabel && <Label at={{ x: W / 2, y: y + h + 20 }} color={BLUE}>{spec.widthLabel}</Label>}
      {spec.heightLabel && <Label at={{ x: x - 10, y: H / 2 }} color={BLUE} anchor="end">{spec.heightLabel}</Label>}
    </svg>
  );
}

function CircleFigure({ spec }: { spec: z.infer<typeof Circle> }) {
  const c = { x: 180, y: 115 };
  const r = 90;
  return (
    <svg viewBox="0 0 360 230" className="h-auto w-full max-w-[360px]">
      <circle cx={c.x} cy={c.y} r={r} fill="#f4f1ff" stroke={BLUE} strokeWidth={3} />
      <circle cx={c.x} cy={c.y} r={3.5} fill={INK} />
      <line x1={spec.diameter ? c.x - r : c.x} y1={c.y} x2={c.x + r} y2={c.y} stroke={CORAL} strokeWidth={2.5} />
      {spec.centerLabel && <Label at={{ x: c.x, y: c.y + 18 }}>{spec.centerLabel}</Label>}
      {spec.radiusLabel && <Label at={{ x: c.x + r / 2, y: c.y - 14 }} color={CORAL}>{spec.radiusLabel}</Label>}
    </svg>
  );
}

function niceStep(span: number) {
  const raw = span / 10;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

function NumberLineFigure({ spec }: { spec: z.infer<typeof NumberLine> }) {
  const [min, max] = spec.min < spec.max ? [spec.min, spec.max] : [spec.max, spec.min];
  const step = spec.step && (max - min) / spec.step <= 40 ? spec.step : niceStep(max - min || 1);
  const W = 400;
  const x = (v: number) => 24 + ((v - min) / (max - min || 1)) * (W - 48);
  const ticks: number[] = [];
  for (let v = min; v <= max + step / 1000 && ticks.length < 41; v += step) ticks.push(v);
  const labelEvery = Math.ceil(ticks.length / 11);
  return (
    <svg viewBox={`0 0 ${W} 110`} className="h-auto w-full max-w-[420px]">
      <line x1={12} y1={60} x2={W - 12} y2={60} stroke={INK} strokeWidth={2} />
      {spec.segment && <line x1={x(spec.segment.from)} y1={60} x2={x(spec.segment.to)} y2={60} stroke={LILAC} strokeWidth={7} strokeLinecap="round" />}
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={x(v)} y1={53} x2={x(v)} y2={67} stroke={INK} strokeWidth={1.5} />
          {i % labelEvery === 0 && <Label at={{ x: x(v), y: 84 }} size={12} color={MUTED}>{fmt(v)}</Label>}
        </g>
      ))}
      {spec.points
        .filter((p) => p.value >= min && p.value <= max)
        .map((p, i) => (
          <g key={`p${i}`}>
            <circle cx={x(p.value)} cy={60} r={6.5} fill={CORAL} />
            <Label at={{ x: x(p.value), y: 34 }} color={CORAL} size={13}>{p.label ?? fmt(p.value)}</Label>
          </g>
        ))}
    </svg>
  );
}

function FractionBarsFigure({ spec }: { spec: z.infer<typeof FractionBars> }) {
  const W = 400;
  const rowH = 44;
  const colors = [BLUE, CORAL, LILAC, "#10b981", "#f59e0b", BLUE];
  const hasLabels = spec.bars.some((b) => b.label);
  const left = hasLabels ? 92 : 12;
  return (
    <svg viewBox={`0 0 ${W} ${spec.bars.length * rowH + 8}`} className="h-auto w-full max-w-[420px]">
      {spec.bars.map((bar, i) => {
        const width = (W - left - 12) / bar.parts;
        return (
          <g key={i}>
            {bar.label && <Label at={{ x: left - 10, y: i * rowH + 26 }} anchor="end" size={14}>{bar.label}</Label>}
            {Array.from({ length: bar.parts }, (_, k) => (
              <rect key={k} x={left + k * width} y={i * rowH + 8} width={width} height={34} fill={k < bar.shaded ? colors[i % colors.length] : "#ffffff"} fillOpacity={k < bar.shaded ? 0.85 : 1} stroke={INK} strokeWidth={1.5} />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function GraphFigure({ spec }: { spec: z.infer<typeof Graph> }) {
  const [xMin, xMax] = spec.xMin < spec.xMax ? [spec.xMin, spec.xMax] : [-10, 10];
  const [yMin, yMax] = spec.yMin < spec.yMax ? [spec.yMin, spec.yMax] : [-10, 10];
  const S = 320;
  const m = 20;
  const X = (v: number) => m + ((v - xMin) / (xMax - xMin)) * (S - 2 * m);
  const Y = (v: number) => S - m - ((v - yMin) / (yMax - yMin)) * (S - 2 * m);
  const xStep = niceStep(xMax - xMin);
  const yStep = niceStep(yMax - yMin);
  const grid: ReactNode[] = [];
  const clipId = `graph-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  for (let v = Math.ceil(xMin / xStep) * xStep; v <= xMax; v += xStep) grid.push(<line key={`gx${v}`} x1={X(v)} y1={m} x2={X(v)} y2={S - m} stroke="#e2e8f0" />);
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) grid.push(<line key={`gy${v}`} x1={m} y1={Y(v)} x2={S - m} y2={Y(v)} stroke="#e2e8f0" />);
  const colors = [BLUE, CORAL, LILAC, "#10b981"];
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="h-auto w-full max-w-[340px]">
      <rect x={m} y={m} width={S - 2 * m} height={S - 2 * m} fill="#ffffff" />
      {grid}
      {xMin <= 0 && xMax >= 0 && <line x1={X(0)} y1={m} x2={X(0)} y2={S - m} stroke={INK} strokeWidth={1.5} />}
      {yMin <= 0 && yMax >= 0 && <line x1={m} y1={Y(0)} x2={S - m} y2={Y(0)} stroke={INK} strokeWidth={1.5} />}
      <Label at={{ x: S - m - 6, y: (yMin <= 0 && yMax >= 0 ? Y(0) : S - m) - 10 }} size={12} color={MUTED}>x</Label>
      <Label at={{ x: (xMin <= 0 && xMax >= 0 ? X(0) : m) + 10, y: m + 8 }} size={12} color={MUTED}>y</Label>
      <clipPath id={clipId}>
        <rect x={m} y={m} width={S - 2 * m} height={S - 2 * m} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {spec.lines.map((l, i) => (
          <line key={i} x1={X(xMin)} y1={Y(l.slope * xMin + l.intercept)} x2={X(xMax)} y2={Y(l.slope * xMax + l.intercept)} stroke={colors[i % colors.length]} strokeWidth={3} />
        ))}
      </g>
      {spec.lines.map((l, i) => {
        if (!l.label) return null;
        const lx = xMin + (xMax - xMin) * 0.8;
        const ly = Math.min(Math.max(l.slope * lx + l.intercept, yMin + (yMax - yMin) * 0.08), yMax - (yMax - yMin) * 0.08);
        return <Label key={`ll${i}`} at={{ x: X(lx), y: Y(ly) - 14 }} color={colors[i % colors.length]} size={13}>{l.label}</Label>;
      })}
      {spec.points
        .filter((p) => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax)
        .map((p, i) => (
          <g key={`pt${i}`}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={5.5} fill={INK} />
            <Label at={{ x: X(p.x) + 8, y: Y(p.y) - 12 }} size={12} anchor="start">{p.label ?? `(${fmt(p.x)}, ${fmt(p.y)})`}</Label>
          </g>
        ))}
    </svg>
  );
}

export function AssistantFigure({ spec }: { spec: FigureSpec }) {
  const figure = (() => {
    switch (spec.type) {
      case "triangle":
        return <TriangleFigure spec={spec} />;
      case "rectangle":
        return <RectangleFigure spec={spec} />;
      case "circle":
        return <CircleFigure spec={spec} />;
      case "numberLine":
        return <NumberLineFigure spec={spec} />;
      case "fractionBars":
        return <FractionBarsFigure spec={spec} />;
      case "graph":
        return <GraphFigure spec={spec} />;
    }
  })();
  return <figure className="flex justify-center rounded-2xl border border-border bg-[#fbfcff] p-3" data-testid="assistant-figure">{figure}</figure>;
}
