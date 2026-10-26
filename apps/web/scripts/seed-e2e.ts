import './load-env';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { generateSync } from 'otplib';
import { adminClient, anonClient, database } from '../e2e/support/admin';
import {
  CREDENTIALS_PATH,
  writeCredentials,
  type E2ECredentials,
} from '../e2e/support/credentials';

const FOUNDER_EMAIL = 'e2e-founder@e2e.agency-os.dev';
const CLIENT_EMAIL = 'e2e-client@e2e.agency-os.dev';
const ORGANIZATION_SLUG = 'e2e-studio';

async function ensureUser(email: string, password?: string): Promise<string> {
  const admin = adminClient().auth.admin;
  const sql = database();
  try {
    const [existing] = await sql<
      { id: string }[]
    >`select id from auth.users where lower(email) = ${email}`;
    if (existing) {
      if (password) await admin.updateUserById(existing.id, { password });
      return existing.id;
    }
  } finally {
    await sql.end();
  }

  const { data, error } = await admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`User creation failed for ${email}: ${error?.message}`);
  return data.user.id;
}

async function enrollFounderTotp(userId: string, email: string, password: string): Promise<string> {
  const admin = adminClient().auth.admin;
  const { data: existing } = await admin.mfa.listFactors({ userId });
  for (const factor of existing?.factors ?? []) {
    await admin.mfa.deleteFactor({ userId, id: factor.id });
  }

  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`Founder sign-in failed: ${signIn.error.message}`);

  const enrolment = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'E2E' });
  if (enrolment.error || enrolment.data.type !== 'totp') {
    throw new Error(`TOTP enrolment failed: ${enrolment.error?.message}`);
  }
  const secret = enrolment.data.totp.secret;
  const verify = await client.auth.mfa.challengeAndVerify({
    factorId: enrolment.data.id,
    code: generateSync({ secret }),
  });
  if (verify.error) throw new Error(`TOTP verification failed: ${verify.error.message}`);
  await client.auth.signOut();
  return secret;
}

async function main(): Promise<void> {
  const previous = existsSync(CREDENTIALS_PATH)
    ? (JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8')) as E2ECredentials)
    : null;
  const password = previous?.founder.password ?? `E2e-${randomBytes(18).toString('base64url')}`;

  const founderId = await ensureUser(FOUNDER_EMAIL, password);
  const clientUserId = await ensureUser(CLIENT_EMAIL);

  const sql = database();
  let organizationId: string;
  let clientId: string;
  try {
    const [organization] = await sql<{ id: string }[]>`
      insert into public.organizations (name, slug) values ('E2E Studio', ${ORGANIZATION_SLUG})
      on conflict (slug) do update set name = excluded.name
      returning id
    `;
    organizationId = organization?.id ?? '';
    const [existingClient] = await sql<{ id: string }[]>`
      select id from public.clients where organization_id = ${organizationId} and name = 'E2E Client'
    `;
    const [client] = existingClient
      ? [existingClient]
      : await sql<{ id: string }[]>`
          insert into public.clients (organization_id, name) values (${organizationId}, 'E2E Client')
          returning id
        `;
    clientId = client?.id ?? '';

    await sql`
      insert into public.profiles (id, full_name, kind) values (${founderId}, 'Inês Duarte', 'internal')
      on conflict (id) do update set full_name = excluded.full_name, kind = excluded.kind
    `;
    await sql`
      insert into public.profiles (id, full_name, kind) values (${clientUserId}, 'Rui Matos', 'client')
      on conflict (id) do update set full_name = excluded.full_name, kind = excluded.kind
    `;
    await sql`
      insert into public.organization_memberships (organization_id, user_id, role, status)
      values (${organizationId}, ${founderId}, 'founder', 'active')
      on conflict (organization_id, user_id) do update set role = 'founder', status = 'active'
    `;
    await sql`
      insert into public.client_memberships (organization_id, client_id, user_id, role, status)
      values (${organizationId}, ${clientId}, ${clientUserId}, 'decision_maker', 'active')
      on conflict (client_id, user_id) do update set status = 'active'
    `;
    await sql`
      insert into public.commercial_settings (organization_id, host_user_id)
      values (${organizationId}, ${founderId})
      on conflict (organization_id) do update set host_user_id = excluded.host_user_id
    `;
    // Every run books real slots; earlier runs would otherwise fill the booking horizon.
    await sql`
      update public.calls set status = 'cancelled'
      where organization_id = ${organizationId} and status = 'scheduled' and starts_at > now()
    `;
    // Every test seeds its own records; earlier runs' deals, clients, tasks and projects would
    // otherwise keep growing every list the home and the accessibility checks render in full. The
    // window only spares a run that started moments ago.
    await sql`
      update public.deals set archived_at = now()
      where organization_id = ${organizationId} and archived_at is null
        and created_at < now() - interval '20 minutes'
    `;
    await sql`
      update public.clients set archived_at = now()
      where organization_id = ${organizationId} and archived_at is null and id <> ${clientId}
        and created_at < now() - interval '20 minutes'
    `;
    await sql`
      update public.tasks set status = 'done', completed_at = now()
      where organization_id = ${organizationId} and status = 'open'
        and created_at < now() - interval '20 minutes'
    `;
    await sql`
      update public.projects set status = 'completed'
      where organization_id = ${organizationId} and status = 'active' and client_id <> ${clientId}
        and created_at < now() - interval '20 minutes'
    `;
    // An interrupted run leaves approvals waiting, which later runs and global sweeps would see.
    await sql`
      update public.approvals set status = 'withdrawn'
      where organization_id = ${organizationId} and status = 'pending'
    `;
  } finally {
    await sql.end();
  }

  const totpSecret = await enrollFounderTotp(founderId, FOUNDER_EMAIL, password);
  writeCredentials({
    organizationId,
    clientId,
    founder: { email: FOUNDER_EMAIL, password, totpSecret },
    client: { email: CLIENT_EMAIL },
  });
  console.log(`Seeded organization ${organizationId} and client ${clientId}`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
