import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import {
  acceptInvitationForUser,
  auditForClaims,
  readClaims,
  startActivity,
} from '@/modules/identity';
import { createSupabaseServerClient } from '@/platform/supabase-server';
import { safeNextPath } from '../mfa/safe-next-path';

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ['magiclink', 'invite', 'email', 'recovery'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'));
  const supabase = await createSupabaseServerClient();

  let failed = true;
  if (code) {
    failed = Boolean((await supabase.auth.exchangeCodeForSession(code)).error);
  } else if (tokenHash && type && EMAIL_OTP_TYPES.includes(type)) {
    failed = Boolean((await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error);
  }

  const claims = failed ? null : await readClaims(supabase.auth);
  if (!claims) {
    const failure = new URL('/magic-link', request.url);
    failure.searchParams.set('error', 'link');
    return NextResponse.redirect(failure);
  }

  await acceptInvitationForUser(claims);
  await auditForClaims(claims, 'auth.sign_in');
  if (claims.user_kind === 'internal') await startActivity(claims.session_id);

  return NextResponse.redirect(new URL(next, request.url));
}
