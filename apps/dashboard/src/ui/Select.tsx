import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  children?: ReactNode;
}

/** Native select styled to match Input (height 56, radius 8). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, id, className, children, ...rest },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const describedBy = error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-caption font-semibold text-text">
          {label}
        </label>
      )}
      <select
        id={selectId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-input rounded-input border border-border bg-surface px-4 text-body text-text',
          'outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30',
          'disabled:cursor-not-allowed disabled:bg-background',
          error && 'border-tier-emergency',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      {hint && !error && (
        <span id={`${selectId}-hint`} className="text-caption text-text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${selectId}-error`} role="alert" className="text-caption text-tier-emergency">
          {error}
        </span>
      )}
    </div>
  );
});
