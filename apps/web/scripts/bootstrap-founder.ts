import './load-env';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import {
  bootstrapFounder,
  createInviteLinkPort,
  createSupabaseAdminPort,
  normalizeEmail,
} from '@/modules/identity';
import { withSystemContext, withUserContext } from '@/platform/db';
import { serverEnv } from '@/platform/env';

const USAGE =
  'Usage: pnpm --filter web bootstrap:founder --email <email> --name <full name> ' +
  '--organization <name> --redirect-url <https://host/accept-invitation> [--deliver email|link]';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    organization: { type: 'string' },
    'redirect-url': { type: 'string' },
    deliver: { type: 'string', default: 'email' },
  },
});

const redirectUrl = values['redirect-url'];
if (
  !values.email ||
  !values.name ||
  !values.organization ||
  !redirectUrl ||
  !['email', 'link'].includes(values.deliver ?? '')
) {
  console.error(USAGE);
  process.exit(1);
}

const env = serverEnv();
const contexts = { withUserContext, withSystemContext };
const linkPort = createInviteLinkPort(
  createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin,
  redirectUrl,
);
const admin =
  values.deliver === 'link'
    ? linkPort
    : createSupabaseAdminPort(
        { url: env.NEXT_PUBLIC_SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY },
        contexts,
      );

try {
  const result = await bootstrapFounder(
    { email: values.email, fullName: values.name, organizationName: values.organization },
    { contexts, admin, invitationRedirectUrl: redirectUrl },
  );
  console.log(JSON.stringify(result));
  const link = linkPort.linkFor(normalizeEmail(values.email));
  if (link) console.log(`Invitation link (single use): ${link}`);
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
