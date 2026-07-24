import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

export interface ConnectionStatusProps {
  /** A refetch is in flight. */
  isFetching?: boolean;
  /** The last fetch failed (stale data on screen). */
  isError?: boolean;
  /** When the data was last successfully updated. */
  lastUpdatedAt?: Date | number | null;
  className?: string;
}

type State = 'live' | 'reconnecting' | 'offline';

/**
 * Connection indicator with an EXPLICIT last-updated time (spec §D2).
 * State is conveyed by shape + label + colour (never colour alone).
 */
export function ConnectionStatus({
  isFetching,
  isError,
  lastUpdatedAt,
  className,
}: ConnectionStatusProps) {
  const { t } = useTranslation('common');
  const state: State = isError ? 'offline' : isFetching ? 'reconnecting' : 'live';

  const dot: Record<State, string> = {
    live: 'bg-success',
    reconnecting: 'bg-tier-urgent animate-pulse',
    offline: 'bg-overdue',
  };
  const defaultLabel: Record<State, string> = {
    live: 'Live',
    reconnecting: 'Updating…',
    offline: 'Offline',
  };

  const label = t(`connection.${state}`, { defaultValue: defaultLabel[state] });

  const updatedText = (() => {
    if (lastUpdatedAt == null) return null;
    const d = new Date(lastUpdatedAt);
    if (Number.isNaN(d.getTime())) return null;
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return t('connection.updatedAt', { defaultValue: 'Updated {{time}}', time });
  })();

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center gap-2 text-caption text-text-muted', className)}
    >
      <span aria-hidden="true" className={cn('inline-block h-2.5 w-2.5 rounded-full', dot[state])} />
      <span className="font-semibold text-text">{label}</span>
      {updatedText && <span>· {updatedText}</span>}
    </span>
  );
}
