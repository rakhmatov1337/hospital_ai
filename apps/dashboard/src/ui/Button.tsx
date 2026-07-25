import type { ButtonHTMLAttributes } from 'react';
import { Button as ShButton } from '@/components/ui/button';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * Design-system button — a thin wrapper over the shadcn/Base-UI `Button` that keeps
 * the app's 4-variant vocabulary and the clinical design-spec sizes (large touch
 * targets, SP4 §2) rather than base-nova's compact defaults.
 *
 * `danger` renders a FILLED destructive (strong affordance for withdraw/confirm),
 * using the preset's `--destructive` — the reserved tier colours are never spent on
 * generic actions.
 */
const VARIANT_MAP: Record<ButtonVariant, 'default' | 'outline' | 'ghost' | 'destructive'> = {
  primary: 'default',
  secondary: 'outline',
  ghost: 'ghost',
  danger: 'destructive',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'h-11 px-4 text-body',
  md: 'h-12 px-6 text-button',
  lg: 'h-input px-8 text-button',
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <ShButton
      type={type}
      variant={VARIANT_MAP[variant]}
      className={cn(
        'rounded-input font-semibold',
        SIZE_CLASS[size],
        variant === 'danger' &&
          'border-transparent bg-destructive text-white hover:bg-destructive/90',
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    />
  );
}
