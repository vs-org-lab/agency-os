export type InvitationTokens = { accessToken: string; refreshToken: string };

export function parseInvitationFragment(hash: string): InvitationTokens | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  if (params.get('type') !== 'invite') return null;

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}
