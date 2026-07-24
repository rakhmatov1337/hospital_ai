import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export type BannerTone = 'info' | 'warning' | 'danger' | 'success';

export interface BannerProps {
  tone?: BannerTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  /** Leading icon override; each tone has a distinct default shape (not colour alone). */
  icon?: ReactNode;
  className?: string;
}

const TONES: Record<BannerTone, { box: string; icon: string }> = {
  info: { box: 'bg-primary-light border-primary text-primary-dark', icon: 'ⓘ' },
  warning: { box: 'bg-primary-light border-tier-urgent text-text', icon: '⚠' },
  danger: { box: 'bg-primary-light border-tier-emergency text-text', icon: '■' },
  success: { box: 'bg-primary-light border-success text-text', icon: '✓' },
};

/** Inline banner. Used for notices and the placeholder-content warning. */
export function Banner({ tone = 'info', title, children, action, icon, className }: BannerProps) {
  const style = TONES[tone];
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-card border-l-4 border px-4 py-3 text-body',
        style.box,
        className,
      )}
    >
      <span aria-hidden="true" className="mt-0.5 text-h2 leading-none">
        {icon ?? style.icon}
      </span>
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-body">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
