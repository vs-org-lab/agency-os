import type { AdminPort, InvitationLinkPort } from './invitations';

type GenerateLinkResult = {
  data: { user: { id: string } | null; properties: { hashed_token: string } | null };
  error: { message: string } | null;
};

export type InviteLinkGenerator = {
  generateLink(params: {
    type: 'invite' | 'magiclink';
    email: string;
    options?: { data?: Record<string, unknown> };
  }): Promise<GenerateLinkResult>;
};

export function createInviteLinkPort(
  admin: InviteLinkGenerator,
  acceptUrl: string,
): AdminPort & { linkFor(email: string): string | undefined } {
  const links = new Map<string, string>();

  return {
    async inviteUserByEmail(email, options) {
      const { data, error } = await admin.generateLink({
        type: 'invite',
        email,
        options: { data: options.data },
      });
      if (error || !data.user || !data.properties) {
        throw new Error(`Invite link generation failed: ${error?.message ?? 'unknown error'}`);
      }
      const url = new URL(acceptUrl);
      url.searchParams.set('token_hash', data.properties.hashed_token);
      url.searchParams.set('type', 'invite');
      links.set(email, url.toString());
      return { userId: data.user.id };
    },
    linkFor(email) {
      return links.get(email);
    },
  };
}

function linkWith(base: string, tokenHash: string, type: 'invite' | 'magiclink'): string {
  const url = new URL(base);
  url.searchParams.set('token_hash', tokenHash);
  url.searchParams.set('type', type);
  return url.toString();
}

/**
 * Invitation links the OS emails itself. A new account gets an invite link to set its password; an
 * account that already exists (for example a client user of another client) gets a magic link that
 * signs it in, where the pending membership is accepted.
 */
export function createInvitationLinkPort(
  admin: InviteLinkGenerator,
  urls: { acceptUrl: string; callbackUrl: string },
  findExistingUser: (email: string) => Promise<string | null>,
): InvitationLinkPort {
  return {
    async createInvitationLink(email, options) {
      const invite = await admin.generateLink({ type: 'invite', email, options });
      if (!invite.error && invite.data.user && invite.data.properties) {
        return {
          userId: invite.data.user.id,
          link: linkWith(urls.acceptUrl, invite.data.properties.hashed_token, 'invite'),
        };
      }
      if (!(await findExistingUser(email))) {
        throw new Error(
          `Invitation link generation failed: ${invite.error?.message ?? 'unknown error'}`,
        );
      }
      const magic = await admin.generateLink({ type: 'magiclink', email });
      if (magic.error || !magic.data.user || !magic.data.properties) {
        throw new Error(
          `Invitation link generation failed: ${magic.error?.message ?? 'unknown error'}`,
        );
      }
      return {
        userId: magic.data.user.id,
        link: linkWith(urls.callbackUrl, magic.data.properties.hashed_token, 'magiclink'),
      };
    },
  };
}
