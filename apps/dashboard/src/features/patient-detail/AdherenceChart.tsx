import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import type { AdherencePoint } from '@hospital-ai/shared-types';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { EmptyState } from '../../ui';

/** Design-system palette (spec §2) — components consume tokens, charts need hex. */
const PRIMARY = '#0F5F6B';
const GRID = '#C9DBDE';
const AXIS = '#5B6673';

interface ChartRow {
  recoveryDay: number;
  percent: number | null;
  numerator: number;
  denominator: number;
}

/**
 * Adherence-over-time line chart (D5). Plots completed-on-time ÷ window-closed
 * assigned tasks per recovery day as a percentage. Every point carries its
 * denominator in the tooltip (never a bare percentage). Accessible: an equivalent
 * data table is provided for screen readers, and the line is not colour-only —
 * the axis + tooltip label the values explicitly.
 */
export function AdherenceChart({ series }: { series: AdherencePoint[] }) {
  const { t } = useTranslation(['patient-detail', 'common']);

  const rows: ChartRow[] = series.map((p) => ({
    recoveryDay: p.recoveryDay,
    percent: p.value === null ? null : Math.round(p.value * 100),
    numerator: p.numerator,
    denominator: p.denominator,
  }));

  const hasData = rows.some((r) => r.percent !== null);
  if (!hasData) {
    return (
      <EmptyState
        title={t('patient-detail:adherence.emptyTitle')}
        description={t('patient-detail:adherence.emptyBody')}
      />
    );
  }

  return (
    <div>
      <div className="h-64 w-full" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
            <XAxis
              dataKey="recoveryDay"
              stroke={AXIS}
              tick={{ fill: AXIS, fontSize: 12 }}
              tickFormatter={(d: number) => t('patient-detail:adherence.dayShort', { n: d })}
            />
            <YAxis
              domain={[0, 100]}
              stroke={AXIS}
              tick={{ fill: AXIS, fontSize: 12 }}
              tickFormatter={(v: number) => `${v}%`}
              width={44}
            />
            <Tooltip content={<AdherenceTooltip />} />
            <Line
              type="monotone"
              dataKey="percent"
              stroke={PRIMARY}
              strokeWidth={2}
              dot={{ r: 3, fill: PRIMARY }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Accessible equivalent of the chart (never colour alone; readable at 200%). */}
      <div className="sr-only">
        <Table>
          <TableCaption>{t('patient-detail:adherence.tableCaption')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t('patient-detail:adherence.colDay')}</TableHead>
              <TableHead>{t('patient-detail:adherence.colValue')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.recoveryDay}>
                <TableCell>{t('patient-detail:adherence.dayShort', { n: r.recoveryDay })}</TableCell>
                <TableCell>
                  {r.percent === null
                    ? t('patient-detail:adherence.notAssessed')
                    : t('patient-detail:adherence.valueWithDenominator', {
                        percent: r.percent,
                        numerator: r.numerator,
                        denominator: r.denominator,
                      })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function AdherenceTooltip({ active, payload }: TooltipProps<number, string>) {
  const { t } = useTranslation('patient-detail');
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as ChartRow;
  return (
    <div className="rounded-input border border-border bg-surface px-3 py-2 text-caption text-text shadow-card">
      <p className="font-semibold">{t('adherence.dayLong', { n: row.recoveryDay })}</p>
      <p className="text-text-muted">
        {row.percent === null
          ? t('adherence.notAssessed')
          : t('adherence.valueWithDenominator', {
              percent: row.percent,
              numerator: row.numerator,
              denominator: row.denominator,
            })}
      </p>
    </div>
  );
}
