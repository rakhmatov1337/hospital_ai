import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/** Text input: height 56, radius 8. Label + hint + error slots. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-caption font-semibold text-text">
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-input rounded-input border border-border bg-surface px-4 text-body text-text',
          'placeholder:text-text-muted outline-none',
          'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30',
          'disabled:cursor-not-allowed disabled:bg-background',
          error && 'border-tier-emergency',
          className,
        )}
        {...rest}
      />
      {hint && !error && (
        <span id={`${inputId}-hint`} className="text-caption text-text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} role="alert" className="text-caption text-tier-emergency">
          {error}
        </span>
      )}
    </div>
  );
});
