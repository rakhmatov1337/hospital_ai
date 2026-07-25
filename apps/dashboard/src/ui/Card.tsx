import type { HTMLAttributes, ReactNode } from 'react';
import { Card as ShadcnCard } from '@/components/ui/card';
import { cn } from '../lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Card padding follows the token (16px). Set false for flush content. */
  padded?: boolean;
  children?: ReactNode;
}

/** Surface container: white bg, 1px border, radius 12, subtle shadow. */
export function Card({ padded = true, className, children, ...rest }: CardProps) {
  return (
    <ShadcnCard
      className={cn(
        'rounded-card border border-border bg-surface shadow-card',
        // Override the shadcn Card's default vertical padding either way.
        padded ? 'p-4' : 'p-0',
        className,
      )}
      {...rest}
    >
      {children}
    </ShadcnCard>
  );
}
