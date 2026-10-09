import { createHash } from 'node:crypto';

export function contractHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalisedName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-PT');
}

/** The typed name must be the confirmed signer, ignoring case and extra spacing. */
export function sameSigner(typed: string, expected: string): boolean {
  const name = normalisedName(typed);
  return name.length > 0 && name === normalisedName(expected);
}
