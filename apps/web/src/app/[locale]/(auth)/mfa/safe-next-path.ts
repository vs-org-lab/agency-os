export function safeNextPath(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value !== 'string') return '/';
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  if (/[\r\n]/.test(value)) return '/';
  return value;
}
