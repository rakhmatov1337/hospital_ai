/**
 * Human-readable labels for backend enum codes (procedure types, etc.).
 *
 * The API returns machine codes like `laparoscopic_appendectomy`. Screens must
 * never show those raw — use these helpers so known codes get a localised label
 * and unknown ones get a humanised fallback ("Open hernia repair"), never
 * `open_hernia_repair`.
 */

type Translate = (key: string, opts?: { defaultValue?: string }) => string;

/** snake_case / kebab-case code → readable Title Case (e.g. `open_hernia_repair` → "Open hernia repair"). */
export function humanizeCode(code: string): string {
  return code
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Localised procedure label; humanises the code when no translation exists. */
export function procedureLabel(t: Translate, code: string | null | undefined): string {
  if (!code) return '—';
  return t(`patient-detail:procedures.${code}`, { defaultValue: humanizeCode(code) });
}
