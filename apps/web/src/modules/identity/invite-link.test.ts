import { describe, expect, it, vi } from 'vitest';
import { createInviteLinkPort } from './invite-link';

describe('createInviteLinkPort', () => {
  it('creates the user through an invite link and records the acceptance url', async () => {
    const generateLink = vi.fn(async () => ({
      data: { user: { id: 'user-1' }, properties: { hashed_token: 'hash-1' } },
      error: null,
    }));
    const port = createInviteLinkPort({ generateLink }, 'https://app.example/accept-invitation');

    const result = await port.inviteUserByEmail('founder@agency.example', {
      redirectTo: 'ignored',
      data: { full_name: 'Founder' },
    });

    expect(result).toEqual({ userId: 'user-1' });
    expect(generateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: 'founder@agency.example',
      options: { data: { full_name: 'Founder' } },
    });
    expect(port.linkFor('founder@agency.example')).toBe(
      'https://app.example/accept-invitation?token_hash=hash-1&type=invite',
    );
  });

  it('throws when the provider rejects the invitation', async () => {
    const port = createInviteLinkPort(
      {
        generateLink: async () => ({
          data: { user: null, properties: null },
          error: { message: 'exists' },
        }),
      },
      'https://app.example/accept-invitation',
    );

    await expect(
      port.inviteUserByEmail('founder@agency.example', { redirectTo: 'ignored' }),
    ).rejects.toThrow(/Invite link generation failed/);
  });
});
