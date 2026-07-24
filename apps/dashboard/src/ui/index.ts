/** Shared design-system component library (SP4 spec §2). Screens consume these. */
export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';
export { Card } from './Card';
export type { CardProps } from './Card';
export { Input } from './Input';
export type { InputProps } from './Input';
export { Select } from './Select';
export type { SelectProps } from './Select';
export { StatusChip } from './StatusChip';
export type { StatusChipProps } from './StatusChip';
export { TierBadge } from './TierBadge';
export type { TierBadgeProps } from './TierBadge';
export { QueueSectionHeader } from './QueueSectionHeader';
export type { QueueSectionHeaderProps } from './QueueSectionHeader';
export { QueueRow } from './QueueRow';
export type { QueueRowProps } from './QueueRow';
export { MetricCard } from './MetricCard';
export type { MetricCardProps } from './MetricCard';
export { DataTable } from './DataTable';
export type { DataTableProps, Column } from './DataTable';
export { ConnectionStatus } from './ConnectionStatus';
export type { ConnectionStatusProps } from './ConnectionStatus';
export { ConfirmDialog } from './ConfirmDialog';
export type { ConfirmDialogProps } from './ConfirmDialog';
export { Banner } from './Banner';
export type { BannerProps, BannerTone } from './Banner';
export { Spinner } from './Spinner';
export type { SpinnerProps } from './Spinner';
export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

// Tier + time helpers (design tokens for tiers; live-elapsed utilities).
export { TIER_META, TIER_ORDER, TIER_COLOR_HEX } from './tier';
export type { TierMeta } from './tier';
export { useNow, minutesSince, formatElapsed } from './use-elapsed';
