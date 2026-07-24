import type { Config } from 'tailwindcss';

/**
 * Design System tokens (SP4 spec §2) — EXACT values, do NOT invent.
 *
 * Colours, the Inter type scale, and radii are declared here so components
 * consume tokens (never raw hex). The 4pt spacing grid {4,8,12,16,24,32,48,64}
 * is Tailwind's native spacing scale (1=4px … 16=64px), so it is used directly:
 *   4→1  8→2  12→3  16→4  24→6  32→8  48→12  64→16
 * Card padding = p-4 (16), radius = rounded-card (12), gap = gap-3 (12);
 * section gap = gap-6/space-y-6 (24); screen padding = p-6 (24);
 * input height = h-14 (56), input radius = rounded-input (8).
 */
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Base palette
        primary: {
          DEFAULT: '#0F5F6B',
          dark: '#0A464F',
          light: '#EDF4F5',
        },
        text: {
          DEFAULT: '#1A2430',
          muted: '#5B6673',
        },
        border: '#C9DBDE',
        surface: '#FFFFFF',
        background: '#F7FAFB',
        // Tier colours (fixed, reserved — NEVER reuse for anything else)
        tier: {
          emergency: '#B3261E', // tier-1 only
          urgent: '#B36B00',
          routine: '#7A6A00',
        },
        success: '#1B7F5A', // completed
        overdue: '#5B6673', // overdue = grey, NEVER red
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
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
