import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tier } from '@hospital-ai/shared-types';
import { MetricCard } from './MetricCard';
import { TierBadge } from './TierBadge';
import { TIER_META } from './tier';

describe('MetricCard', () => {
  it('always renders the denominator beneath the value', () => {
    render(<MetricCard value="80%" label="Adherence" denominator="4 of 5 patients" />);
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('4 of 5 patients')).toBeInTheDocument();
  });
});

describe('TierBadge', () => {
  it('communicates tier with an icon + label (never colour alone)', () => {
    const { container } = render(<TierBadge tier={Tier.emergency} />);
    const badge = container.querySelector('[data-tier="emergency"]');
    expect(badge).toBeTruthy();
    // Shape icon present so the tier is distinguishable without colour.
    expect(badge?.textContent).toContain(TIER_META[Tier.emergency].icon);
    // Bound to the reserved tier colour token.
    expect(badge?.className).toContain('tier-emergency');
  });

  it('uses a distinct shape per tier', () => {
    const icons = new Set([
      TIER_META[Tier.emergency].icon,
      TIER_META[Tier.urgent].icon,
      TIER_META[Tier.routine].icon,
    ]);
    expect(icons.size).toBe(3);
  });
});
