import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function adminClient(): SupabaseClient {
  return createClient(required('NEXT_PUBLIC_SUPABASE_URL'), required('SUPABASE_SECRET_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function anonClient(): SupabaseClient {
  return createClient(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function database(): postgres.Sql {
  return postgres(required('DATABASE_DIRECT_URL'), { max: 1, prepare: false });
}

export async function magicLinkPath(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !data.properties) throw new Error(`Magic link generation failed: ${error?.message}`);
  return `/callback?token_hash=${data.properties.hashed_token}&type=magiclink`;
}

export async function createTeamInvitation(
  organizationId: string,
): Promise<{ email: string; path: string }> {
  const email = `e2e-invitee-${randomUUID().slice(0, 8)}@e2e.agency-os.dev`;
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'invite', email });
  if (error || !data.user || !data.properties) {
    throw new Error(`Invite generation failed: ${error?.message}`);
  }

  const sql = database();
  try {
    await sql`
      insert into public.profiles (id, full_name, kind)
      values (${data.user.id}, 'E2E Invitee', 'internal') on conflict (id) do nothing
    `;
    await sql`
      insert into public.organization_memberships (organization_id, user_id, role, status)
      values (${organizationId}, ${data.user.id}, 'project_manager', 'invited')
      on conflict (organization_id, user_id) do nothing
    `;
  } finally {
    await sql.end();
  }

  return {
    email,
    path: `/accept-invitation?token_hash=${data.properties.hashed_token}&type=invite`,
  };
}
