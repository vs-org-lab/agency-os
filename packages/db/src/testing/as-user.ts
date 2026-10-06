import { randomUUID } from 'node:crypto';
import type { TransactionSql } from 'postgres';

export type AssuranceLevel = 'aal1' | 'aal2';

export type AsUserOptions = {
  aal?: AssuranceLevel;
  sessionId?: string;
  mfaVerifiedAt?: Date;
};

export async function asUser(
  sql: TransactionSql,
  userId: string,
  options: AsUserOptions = {},
): Promise<void> {
  const aal = options.aal ?? 'aal2';
  const now = Math.floor(Date.now() / 1000);
  const amr =
    aal === 'aal2'
      ? [
          {
            method: 'totp',
            timestamp: Math.floor((options.mfaVerifiedAt ?? new Date()).getTime() / 1000),
          },
          { method: 'password', timestamp: now },
        ]
      : [{ method: 'password', timestamp: now }];
  const claims = {
    sub: userId,
    role: 'authenticated',
    aud: 'authenticated',
    aal,
    amr,
    session_id: options.sessionId ?? randomUUID(),
  };

  await sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
  await sql`set local role authenticated`;
}

export async function asAnonymous(sql: TransactionSql): Promise<void> {
  await sql`select set_config('request.jwt.claims', ${JSON.stringify({ role: 'anon' })}, true)`;
  await sql`set local role anon`;
}

export async function asSystem(sql: TransactionSql): Promise<void> {
  await sql`reset role`;
  await sql`select set_config('request.jwt.claims', '', true)`;
}
