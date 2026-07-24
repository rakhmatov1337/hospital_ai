import { Tier } from '@hospital-ai/shared-types';

/**
 * Tier presentation map — the single source of truth for tier colour + icon +
 * label. Accessibility rule (non-negotiable): a tier is NEVER communicated by
 * colour alone, so every tier carries a distinct SHAPE icon and a text label.
 *
 * Tier colours are reserved — do not reuse these hexes for anything else.
 */
export interface TierMeta {
  /** Distinct shape so tiers differ without relying on colour. */
  icon: string;
  /** English default label (i18n key: common:tier.<tier>). */
  defaultLabel: string;
  /** Tailwind text-colour utility bound to the tier token. */
  textClass: string;
  /** Tailwind background utility bound to the tier token. */
  bgClass: string;
  /** Tailwind border-colour utility bound to the tier token. */
  borderClass: string;
  /** Raw hex — for chart libraries (Recharts) that need a colour value. */
  hex: string;
}

export const TIER_META: Record<Tier, TierMeta> = {
  [Tier.emergency]: {
    icon: '▲',
    defaultLabel: 'Emergency',
    textClass: 'text-tier-emergency',
    bgClass: 'bg-tier-emergency',
    borderClass: 'border-tier-emergency',
    hex: '#B3261E',
  },
  [Tier.urgent]: {
    icon: '◆',
    defaultLabel: 'Urgent',
    textClass: 'text-tier-urgent',
    bgClass: 'bg-tier-urgent',
    borderClass: 'border-tier-urgent',
    hex: '#B36B00',
  },
  [Tier.routine]: {
    icon: '●',
    defaultLabel: 'Routine',
    textClass: 'text-tier-routine',
    bgClass: 'bg-tier-routine',
    borderClass: 'border-tier-routine',
    hex: '#7A6A00',
  },
};

/** Fixed display order: Emergency → Urgent → Routine. Never reorder. */
export const TIER_ORDER: readonly Tier[] = [Tier.emergency, Tier.urgent, Tier.routine];

/** Hex map for charts (design-system palette). */
export const TIER_COLOR_HEX: Record<Tier, string> = {
  [Tier.emergency]: TIER_META[Tier.emergency].hex,
  [Tier.urgent]: TIER_META[Tier.urgent].hex,
  [Tier.routine]: TIER_META[Tier.routine].hex,
};
