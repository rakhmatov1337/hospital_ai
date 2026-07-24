import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TIER_COLOR_HEX, TIER_META, TIER_ORDER } from '../../ui';
import type { Denominated } from './api';
import { pctValue } from './format';

/**
 * D6 charts (Recharts, design-system palette). Accessibility:
 *  - never colour alone — every series is distinguished by an axis category
 *    label (recovery day, day-7/14/30, tier name+icon, language), not hue;
 *  - every tooltip shows the denominator behind the percentage;
 *  - each chart is wrapped in a role="img" figure carrying a text summary.
 */

// Design-system hexes for charts (tier.ts keeps its own `hex` for the same reason).
const PRIMARY = '#0F5F6B';
const SUCCESS = '#1B7F5A';
const AXIS = '#5B6673'; // text-muted
const GRID = '#C9DBDE'; // border

interface PctDatum {
  label: string;
  pct: number | null;
  num: number;
  den: number;
  fill?: string;
}

interface CountDatum {
  label: string;
  count: number;
  total: number;
  fill?: string;
}

/** Accessible chart frame: caption + role="img" wrapper with an offscreen summary. */
function ChartFrame({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: ReactNode;
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-h2 font-semibold text-text">{title}</figcaption>
      <div role="img" aria-label={`${title}. ${summary}`}>
        {children}
      </div>
    </figure>
  );
}

/** Minimal shape of the Recharts tooltip render props we actually read. */
interface TooltipRenderProps {
  active?: boolean;
  payload?: Array<{ payload?: unknown }>;
  unit: string;
}

function PctTooltip({ active, payload, unit }: TooltipRenderProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload as PctDatum | undefined;
  if (!d) return null;
  return (
    <div className="rounded-input border border-border bg-surface p-2 text-caption shadow-card">
      <p className="font-semibold text-text">{d.label}</p>
      <p className="text-text">{d.pct == null ? '—' : `${d.pct}%`}</p>
      <p className="text-text-muted">
        {d.num} of {d.den} {unit}
      </p>
    </div>
  );
}

function CountTooltip({ active, payload, unit }: TooltipRenderProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload as CountDatum | undefined;
  if (!d) return null;
  return (
    <div className="rounded-input border border-border bg-surface p-2 text-caption shadow-card">
      <p className="font-semibold text-text">{d.label}</p>
      <p className="text-text">
        {d.count} of {d.total} {unit}
      </p>
    </div>
  );
}

/** Adherence % by recovery day — a single primary line; days sit on the X axis. */
export function AdherenceTrendChart({
  byRecoveryDay,
  title,
  unit,
}: {
  byRecoveryDay: Record<number, Denominated>;
  title: string;
  unit: string;
}) {
  const data: PctDatum[] = Object.entries(byRecoveryDay)
    .map(([day, d]) => ({
      label: `Day ${day}`,
      day: Number(day),
      pct: pctValue(d),
      num: d.numerator,
      den: d.denominator,
    }))
    .sort((a, b) => (a as { day: number }).day - (b as { day: number }).day);

  const summary = data.map((d) => `${d.label}: ${d.pct == null ? 'n/a' : `${d.pct}%`} (${d.num} of ${d.den})`).join('; ');

  return (
    <ChartFrame title={title} summary={summary}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} width={44} />
          <Tooltip content={({ active, payload }) => <PctTooltip active={active} payload={payload} unit={unit} />} />
          <Line
            type="monotone"
            dataKey="pct"
            stroke={PRIMARY}
            strokeWidth={2}
            dot={{ r: 3, fill: PRIMARY }}
            connectNulls
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Retention curve — % active at day 7 / 14 / 30, as labelled bars. */
export function RetentionChart({
  points,
  title,
  unit,
}: {
  points: Array<{ label: string; d: Denominated }>;
  title: string;
  unit: string;
}) {
  const data: PctDatum[] = points.map((p) => ({
    label: p.label,
    pct: pctValue(p.d),
    num: p.d.numerator,
    den: p.d.denominator,
  }));
  const summary = data.map((d) => `${d.label}: ${d.pct == null ? 'n/a' : `${d.pct}%`} (${d.num} of ${d.den})`).join('; ');

  return (
    <ChartFrame title={title} summary={summary}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
          <YAxis domain={[0, 100]} unit="%" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} width={44} />
          <Tooltip cursor={{ fill: 'rgba(15,95,107,0.06)' }} content={({ active, payload }) => <PctTooltip active={active} payload={payload} unit={unit} />} />
          <Bar dataKey="pct" fill={SUCCESS} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Escalation counts by tier — bars in reserved tier colours, labelled by tier name + icon. */
export function EscalationTierChart({
  countByTier,
  total,
  title,
  unit,
  tierLabels,
}: {
  countByTier: Record<string, number>;
  total: number;
  title: string;
  unit: string;
  /** Localised label per tier key. */
  tierLabels: Record<string, string>;
}) {
  const data: CountDatum[] = TIER_ORDER.map((tier) => ({
    label: `${TIER_META[tier].icon} ${tierLabels[tier] ?? TIER_META[tier].defaultLabel}`,
    count: countByTier[tier] ?? 0,
    total,
    fill: TIER_COLOR_HEX[tier],
  }));
  const summary = data.map((d) => `${d.label}: ${d.count} of ${d.total}`).join('; ');

  return (
    <ChartFrame title={title} summary={summary}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
          <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} width={44} />
          <Tooltip cursor={{ fill: 'rgba(15,95,107,0.06)' }} content={({ active, payload }) => <CountTooltip active={active} payload={payload} unit={unit} />} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Patients per language — labelled bars (language codes on the axis). */
export function LanguageSplitChart({
  patientsByLanguage,
  population,
  title,
  unit,
}: {
  patientsByLanguage: Record<string, number>;
  population: number;
  title: string;
  unit: string;
}) {
  const data: CountDatum[] = Object.entries(patientsByLanguage)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => ({ label: lang.toUpperCase(), count, total: population }));
  const summary = data.map((d) => `${d.label}: ${d.count} of ${d.total}`).join('; ');

  return (
    <ChartFrame title={title} summary={summary}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} />
          <YAxis allowDecimals={false} tick={{ fill: AXIS, fontSize: 12 }} stroke={GRID} width={44} />
          <Tooltip cursor={{ fill: 'rgba(15,95,107,0.06)' }} content={({ active, payload }) => <CountTooltip active={active} payload={payload} unit={unit} />} />
          <Bar dataKey="count" fill={PRIMARY} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
