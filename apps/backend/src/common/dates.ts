export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.floor((b - a) / 86_400_000);
}

export function postOpDay(surgeryDate: string): number {
  return Math.max(0, daysBetween(surgeryDate, today()));
}
