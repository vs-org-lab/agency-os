const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIso(value: string | null | undefined): Date | undefined {
  const match = value ? ISO_DATE.exec(value) : null;
  if (!match) return undefined;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function formatDisplay(date: Date, locale: string): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return locale.toLowerCase().startsWith('pt')
    ? `${day}/${month}/${date.getFullYear()}`
    : `${month}/${day}/${date.getFullYear()}`;
}
