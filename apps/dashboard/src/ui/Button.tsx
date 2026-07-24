import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark focus-visible:ring-primary',
  secondary:
    'bg-surface text-primary border border-primary hover:bg-primary-light focus-visible:ring-primary',
  ghost: 'bg-transparent text-primary hover:bg-primary-light focus-visible:ring-primary',
  danger: 'bg-tier-emergency text-white hover:opacity-90 focus-visible:ring-tier-emergency',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-11 px-4 text-body',
  md: 'h-12 px-6 text-button',
  lg: 'h-input px-8 text-button',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-input font-semibold outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    />
  );
});
