import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVerifiedClaims = vi.fn();
const proofLink = vi.fn();

vi.mock('@/platform/session', () => ({ getVerifiedClaims }));
vi.mock('@/modules/proofing/server', () => ({ proofLink }));

const { GET } = await import('./route');

const VERSION_ID = '5b0c3c1e-8f7a-4d2b-9a51-0f6f4d1e2c3b';
const call = (versionId: string) =>
  GET(new Request(`https://os.example.com/api/proofs/${versionId}/file`), {
    params: Promise.resolve({ versionId }),
  });

describe('proof file route', () => {
  beforeEach(() => {
    getVerifiedClaims.mockReset();
    proofLink.mockReset();
  });

  it('redirects readers to a fresh signed link that is never cached', async () => {
    getVerifiedClaims.mockResolvedValue({ sub: 'user-1' });
    proofLink.mockResolvedValue('https://project.supabase.co/storage/v1/object/sign/proofs/a?token=t');

    const response = await call(VERSION_ID);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://project.supabase.co/storage/v1/object/sign/proofs/a?token=t',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(proofLink).toHaveBeenCalledWith({ sub: 'user-1' }, VERSION_ID);
  });

  it('answers not found without a session, a reader or a valid id', async () => {
    getVerifiedClaims.mockResolvedValue(null);
    expect((await call(VERSION_ID)).status).toBe(404);

    getVerifiedClaims.mockResolvedValue({ sub: 'user-1' });
    proofLink.mockResolvedValue(null);
    expect((await call(VERSION_ID)).status).toBe(404);
    expect((await call('not-a-uuid')).status).toBe(404);
  });
});
