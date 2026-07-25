import type { Config } from 'tailwindcss';

/**
 * Design System tokens.
 *
 * Loaded by Tailwind v4 via `@config "../tailwind.config.ts"` in `src/index.css`.
 * v4 is CSS-first, but this legacy config is kept so the domain token scale (type
 * ramp, radii, component sizes) and the shadcn colour bridge live in one typed
 * place; base-nova's custom variants, animations and utilities come from the
 * `@import "shadcn/tailwind.css"` + `tw-animate-css` in the stylesheet.
 *
 * TWO token families live here and are bridged deliberately:
 *
 *  1. **shadcn / preset `b2vOj9MYNc` (base-nova)** — the base palette is driven by
 *     CSS variables declared in `src/index.css` (`--background`, `--primary`, …, in
 *     oklch, with a `.dark` block). They are surfaced here as `var(--…)` colours so
 *     BOTH shadcn components (`bg-primary text-primary-foreground border-border`) and
 *     the existing screens (`bg-background`, `text-text`, `text-text-muted`, `border`)
 *     resolve to the preset theme. `text`/`surface` are kept as aliases onto the
 *     preset vars so hundreds of existing className usages adopt the new theme
 *     WITHOUT a per-file rewrite.
 *
 *  2. **Domain tokens (SP4 spec §2) — EXACT values, do NOT invent.** The tier
 *     colours, `success`, and `overdue` are SAFETY-CRITICAL and reserved (tier-1 red
 *     is emergency-only; `overdue` is grey, NEVER red) so they stay literal and are
 *     never folded into the preset palette. The Inter-era type scale, radii and
 *     component sizes are kept so the 4pt grid and `text-caption`/`rounded-input`/
 *     `h-input` utilities used across every screen keep working.
 */
const config: Config = {
  // Dark mode is defined in index.css via `@custom-variant dark` (v4 CSS-first).
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // --- shadcn / preset base palette (CSS vars → oklch, themable via .dark) ---
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: {
          DEFAULT: 'var(--primary)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          foreground: 'var(--secondary-foreground)',
        },
        destructive: {
          DEFAULT: 'var(--destructive)',
          foreground: 'var(--primary-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          foreground: 'var(--accent-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover)',
          foreground: 'var(--popover-foreground)',
        },
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
        // Bridge: existing screens use `text-text` / `text-text-muted` / `bg-surface`.
        // Alias them onto the preset vars so they adopt the new theme in place.
        text: {
          DEFAULT: 'var(--foreground)',
          muted: 'var(--muted-foreground)',
        },
        surface: 'var(--card)',

        // --- Domain tokens (safety-critical, reserved — NEVER themed away) ---
        tier: {
          emergency: '#B3261E', // tier-1 only
          urgent: '#B36B00',
          routine: '#7A6A00',
        },
        success: '#1B7F5A', // completed
        overdue: '#5B6673', // overdue = grey, NEVER red
      },
      fontFamily: {
        // Preset fonts (DM Sans / Outfit, loaded in index.css); Inter kept as fallback.
        sans: ['DM Sans Variable', 'Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        heading: ['Outfit Variable', 'DM Sans Variable', 'Inter', 'system-ui', 'sans-serif'],
      },
      // Inter type scale — line-height 1.5 throughout.
      fontSize: {
        display: ['28px', { lineHeight: '1.5', fontWeight: '700' }],
        h1: ['22px', { lineHeight: '1.5', fontWeight: '700' }],
        h2: ['18px', { lineHeight: '1.5', fontWeight: '600' }],
        'body-l': ['18px', { lineHeight: '1.5', fontWeight: '400' }],
        body: ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        button: ['18px', { lineHeight: '1.5', fontWeight: '600' }],
      },
      borderRadius: {
        // shadcn radius scale from the preset (--radius), plus the domain radii.
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        card: '12px',
        input: '8px',
      },
      // Component-specific sizes kept on the 4pt grid.
      height: {
        input: '56px',
        row: '64px',
      },
      minHeight: {
        input: '56px',
        row: '64px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(26, 36, 48, 0.06), 0 1px 3px 0 rgba(26, 36, 48, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
