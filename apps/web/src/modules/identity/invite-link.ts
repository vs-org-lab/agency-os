import type { AdminPort } from './invitations';

type GenerateLinkResult = {
  data: { user: { id: string } | null; properties: { hashed_token: string } | null };
  error: { message: string } | null;
};

export type InviteLinkGenerator = {
  generateLink(params: {
    type: 'invite';
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
