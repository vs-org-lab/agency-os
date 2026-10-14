import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords';
import { signHubToken, verifyHubToken } from './tokens';

const SECRET = 'test-secret-with-enough-length-0123456789';
const HUB = '3f2b8c1e-7d4a-4c6e-9b1a-2e5f8d7c6b4a';
const NOW = new Date('2026-10-14T12:00:00Z');

describe('brand hub site tokens', () => {
  it('tokens fail when tampered, expired, for another hub or an older access version', () => {
    const token = signHubToken(
      { hubId: HUB, mode: 'password', version: 3, expiresAt: new Date('2026-10-21T12:00:00Z') },
      SECRET,
    );
    expect(verifyHubToken(token, SECRET, NOW)).toEqual({
      hubId: HUB,
      mode: 'password',
      version: 3,
    });

    const [payload, signature] = token.split('.') as [string, string];
    const forged = Buffer.from(
      JSON.stringify({ h: 'another', m: 'password', v: 3, e: Date.parse('2026-10-21T12:00:00Z') }),
    ).toString('base64url');
    expect(verifyHubToken(`${forged}.${signature}`, SECRET, NOW)).toBeNull();
    expect(verifyHubToken(`${payload}.${signature.slice(0, -2)}xx`, SECRET, NOW)).toBeNull();
    expect(verifyHubToken(token, 'another-secret-with-enough-length-0000', NOW)).toBeNull();
    expect(verifyHubToken(token, SECRET, new Date('2026-10-21T12:00:01Z'))).toBeNull();
    for (const broken of ['', 'abc', 'a.b.c', `${payload}.`, '.sig']) {
      expect(verifyHubToken(broken, SECRET, NOW)).toBeNull();
    }
  });

  it('passwords are hashed and verified', async () => {
    const stored = await hashPassword('marca segura 2026');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(stored).not.toContain('marca segura');
    expect(await verifyPassword('marca segura 2026', stored)).toBe(true);
    expect(await verifyPassword('marca segura 2027', stored)).toBe(false);
    expect(await verifyPassword('marca segura 2026', 'scrypt$broken')).toBe(false);
    expect(await hashPassword('marca segura 2026')).not.toBe(stored);
  });
});
