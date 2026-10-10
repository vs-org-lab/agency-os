import { describe, expect, it, vi } from 'vitest';
import { createInvitationLinkPort, createInviteLinkPort } from './invite-link';

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

describe('createInvitationLinkPort', () => {
  const urls = {
    acceptUrl: 'https://app.example/accept-invitation',
    callbackUrl: 'https://app.example/callback',
  };

  it('returns an invite link for a new account', async () => {
    const generateLink = vi.fn(async () => ({
      data: { user: { id: 'user-1' }, properties: { hashed_token: 'hash-1' } },
      error: null,
    }));
    const port = createInvitationLinkPort({ generateLink }, urls, async () => null);

    expect(
      await port.createInvitationLink('pm@agency.example', { data: { full_name: 'Rita' } }),
    ).toEqual({
      userId: 'user-1',
      link: 'https://app.example/accept-invitation?token_hash=hash-1&type=invite',
    });
  });

  it('signs an existing account in with a magic link instead', async () => {
    const generateLink = vi.fn(async (params: { type: string }) =>
      params.type === 'invite'
        ? { data: { user: null, properties: null }, error: { message: 'already registered' } }
        : {
            data: { user: { id: 'user-2' }, properties: { hashed_token: 'hash-2' } },
            error: null,
          },
    );
    const port = createInvitationLinkPort({ generateLink }, urls, async () => 'user-2');

    expect(await port.createInvitationLink('client@example.com', {})).toEqual({
      userId: 'user-2',
      link: 'https://app.example/callback?token_hash=hash-2&type=magiclink',
    });
    expect(generateLink).toHaveBeenLastCalledWith({
      type: 'magiclink',
      email: 'client@example.com',
    });
  });

  it('throws when the provider fails for an unknown account', async () => {
    const port = createInvitationLinkPort(
      {
        generateLink: async () => ({
          data: { user: null, properties: null },
          error: { message: 'unavailable' },
        }),
      },
      urls,
      async () => null,
    );

    await expect(port.createInvitationLink('x@example.com', {})).rejects.toThrow(
      /Invitation link generation failed/,
    );
  });
});
