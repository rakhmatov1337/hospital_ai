/**
 * Canonical class-name combiner. Delegates to `@/lib/utils` (clsx + tailwind-merge)
 * so old imports (`../lib/cn`) and shadcn's `@/lib/utils` share ONE implementation
 * and Tailwind class conflicts are resolved correctly.
 */
export { cn } from './utils';
