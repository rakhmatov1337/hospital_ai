import { useId, type ReactNode } from 'react';
import {
  Select as ShSelect,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '../lib/cn';

export interface SelectProps {
  label?: string;
  error?: string;
  hint?: string;
  value?: string;
  defaultValue?: string;
  /** Fires with the chosen item value (shadcn/Base-UI Select is value-based, not event-based). */
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  name?: string;
  className?: string;
  /** `SelectItem`s (re-exported from this module). */
  children?: ReactNode;
}

/**
 * Labelled select — the shadcn/Base-UI `Select` under the hood, kept at the
 * design-spec size (min-height 56, radius 8) with the app's label + hint + error
 * slots. Options are passed as `SelectItem` children (re-exported below).
 */
export function Select({
  label,
  error,
  hint,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  id,
  name,
  className,
  children,
}: SelectProps) {
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
      <ShSelect
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange ? (next) => onValueChange(next ?? '') : undefined}
        disabled={disabled}
        name={name}
      >
        <SelectTrigger
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-h-input w-full rounded-input px-4 text-body',
            error && 'border-destructive',
            className,
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </ShSelect>
      {hint && !error && (
        <span id={`${selectId}-hint`} className="text-caption text-text-muted">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${selectId}-error`} role="alert" className="text-caption text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

export { SelectItem } from '@/components/ui/select';
