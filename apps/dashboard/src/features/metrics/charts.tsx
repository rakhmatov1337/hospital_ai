import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, XAxis, YAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { TIER_COLOR_HEX, TIER_META, TIER_ORDER } from '../../ui';
import type { Denominated } from './api';
import { pctValue } from './format';

/**
 * D6 charts — Recharts wrapped in the shadcn `ChartContainer`/`ChartTooltip`
 * (theme-aware colours via CSS vars). Accessibility:
 *  - never colour alone — every series is distinguished by an axis category
 *    label (recovery day, day-7/14/30, tier name+icon, language), not hue;
 *  - every tooltip shows the denominator behind the percentage;
 *  - each chart is wrapped in a role="img" figure carrying a text summary.
 */

interface PctDatum {
  label: string;
  pct: number | null;
  num: number;
  den: number;
}

interface CountDatum {
  label: string;
  count: number;
  total: number;
  fill?: string;
}

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 } as const;

/** Accessible chart frame: caption + role="img" wrapper with an offscreen summary. */
function ChartFrame({
  title,
  summary,
  config,
  children,
}: {
  title: string;
  summary: string;
  config: ChartConfig;
  children: React.ComponentProps<typeof ChartContainer>['children'];
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-3 text-h2 font-semibold text-text">{title}</figcaption>
      <div role="img" aria-label={`${title}. ${summary}`}>
        <ChartContainer config={config} className="aspect-auto h-[240px] w-full">
          {children}
        </ChartContainer>
      </div>
    </figure>
  );
}

/** Tooltip line for a percentage metric: "82% · 41 of 50 patients". */
function pctFormatter(unit: string) {
  return (value: unknown, _name: unknown, item: { payload?: PctDatum }) => {
    const d = item.payload;
    if (!d) return null;
    return (
      <span className="text-caption">
        <span className="font-semibold text-text">{d.pct == null ? '—' : `${d.pct}%`}</span>{' '}
        <span className="text-text-muted">
          · {d.num} of {d.den} {unit}
        </span>
      </span>
    );
  };
}

function countFormatter(unit: string) {
  return (value: unknown, _name: unknown, item: { payload?: CountDatum }) => {
    const d = item.payload;
    if (!d) return null;
    return (
      <span className="text-caption text-text-muted">
        <span className="font-semibold text-text">{d.count}</span> of {d.total} {unit}
      </span>
    );
  };
}

/** Adherence % by recovery day — a single line; days sit on the X axis. */
export function AdherenceTrendChart({
  byRecoveryDay,
  title,
  unit,
}: {
  byRecoveryDay: Record<number, Denominated>;
  title: string;
  unit: string;
}) {
  const data: Array<PctDatum & { day: number }> = Object.entries(byRecoveryDay)
    .map(([day, d]) => ({
      label: `Day ${day}`,
      day: Number(day),
      pct: pctValue(d),
      num: d.numerator,
      den: d.denominator,
    }))
    .sort((a, b) => a.day - b.day);

  const summary = data
    .map((d) => `${d.label}: ${d.pct == null ? 'n/a' : `${d.pct}%`} (${d.num} of ${d.den})`)
    .join('; ');
  const config = { pct: { label: unit, color: 'var(--chart-1)' } } satisfies ChartConfig;

  return (
    <ChartFrame title={title} summary={summary} config={config}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} stroke="var(--border)" tickLine={false} />
        <YAxis domain={[0, 100]} unit="%" tick={AXIS_TICK} stroke="var(--border)" width={44} tickLine={false} />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" formatter={pctFormatter(unit)} />} />
        <Line
          type="monotone"
          dataKey="pct"
          stroke="var(--color-pct)"
          strokeWidth={2.5}
          dot={{ r: 3, fill: 'var(--color-pct)' }}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

/** Retention — % active at day 7 / 14 / 30, as labelled bars. */
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
  const summary = data
    .map((d) => `${d.label}: ${d.pct == null ? 'n/a' : `${d.pct}%`} (${d.num} of ${d.den})`)
    .join('; ');
  const config = { pct: { label: unit, color: 'var(--chart-2)' } } satisfies ChartConfig;

  return (
    <ChartFrame title={title} summary={summary} config={config}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} stroke="var(--border)" tickLine={false} />
        <YAxis domain={[0, 100]} unit="%" tick={AXIS_TICK} stroke="var(--border)" width={44} tickLine={false} />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" formatter={pctFormatter(unit)} />} />
        <Bar dataKey="pct" fill="var(--color-pct)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
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
  tierLabels: Record<string, string>;
}) {
  const data: CountDatum[] = TIER_ORDER.map((tier) => ({
    label: `${TIER_META[tier].icon} ${tierLabels[tier] ?? TIER_META[tier].defaultLabel}`,
    count: countByTier[tier] ?? 0,
    total,
    fill: TIER_COLOR_HEX[tier],
  }));
  const summary = data.map((d) => `${d.label}: ${d.count} of ${d.total}`).join('; ');
  const config = { count: { label: unit } } satisfies ChartConfig;

  return (
    <ChartFrame title={title} summary={summary} config={config}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} stroke="var(--border)" tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} stroke="var(--border)" width={44} tickLine={false} />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" formatter={countFormatter(unit)} />} />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.label} fill={d.fill} />
          ))}
        </Bar>
      </BarChart>
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
  const config = { count: { label: unit, color: 'var(--chart-3)' } } satisfies ChartConfig;

  return (
    <ChartFrame title={title} summary={summary} config={config}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS_TICK} stroke="var(--border)" tickLine={false} />
        <YAxis allowDecimals={false} tick={AXIS_TICK} stroke="var(--border)" width={44} tickLine={false} />
        <ChartTooltip content={<ChartTooltipContent labelKey="label" formatter={countFormatter(unit)} />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ChartFrame>
  );
}
