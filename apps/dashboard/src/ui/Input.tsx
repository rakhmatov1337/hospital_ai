import { useId, type InputHTMLAttributes } from 'react';
import { Input as ShInput } from '@/components/ui/input';
import { cn } from '../lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/**
 * Text field — the shadcn/Base-UI `Input` under the hood, kept at the design-spec
 * size (height 56, radius 8) with the app's label + hint + error slots. Validation
 * errors are surfaced via `aria-invalid` (which drives the destructive ring) and a
 * `text-destructive` message — the reserved tier-emergency colour is not spent here.
 */
export function Input({ label, error, hint, id, className, ...rest }: InputProps) {
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
      <ShInput
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn('h-input rounded-input px-4 text-body', className)}
        {...rest}
      />
      {hint && !error && (
        <span id={`${inputId}-hint`} className="text-caption text-text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${inputId}-error`} role="alert" className="text-caption text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
