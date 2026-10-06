import './load-env';
import { parseArgs } from 'node:util';
import { bootstrapFounder, createSupabaseAdminPort } from '@/modules/identity';
import { withSystemContext, withUserContext } from '@/platform/db';
import { serverEnv } from '@/platform/env';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    organization: { type: 'string' },
    'redirect-url': { type: 'string', default: 'http://localhost:3000/accept-invitation' },
  },
});

if (!values.email || !values.name || !values.organization) {
  console.error(
    'Usage: pnpm --filter web bootstrap:founder --email <email> --name <full name> --organization <name> [--redirect-url <url>]',
  );
  process.exit(1);
}

const env = serverEnv();
const contexts = { withUserContext, withSystemContext };

try {
  const result = await bootstrapFounder(
    { email: values.email, fullName: values.name, organizationName: values.organization },
    {
      contexts,
      admin: createSupabaseAdminPort(
        { url: env.NEXT_PUBLIC_SUPABASE_URL, secretKey: env.SUPABASE_SECRET_KEY },
        contexts,
      ),
      invitationRedirectUrl: values['redirect-url'],
    },
  );
  console.log(JSON.stringify(result));
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
