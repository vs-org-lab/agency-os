const PROBE_ORIGIN = 'https://agency-os.invalid';

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

export function safeNextPath(value: FormDataEntryValue | string | null | undefined): string {
  if (typeof value !== 'string' || value === '') return '/';

  const plain = decoded(value);
  if (plain === null) return '/';
  for (const candidate of [value, plain]) {
    if (hasControlCharacters(candidate)) return '/';
    if (!candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/\\')) {
      return '/';
    }
  }

  const url = new URL(value, PROBE_ORIGIN);
  if (url.origin !== PROBE_ORIGIN) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}
