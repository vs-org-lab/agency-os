import 'server-only';
import { cookies, headers } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { publicEnv, serverEnv } from './env';
import { clientIpAddress } from './request';

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
};

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const env = publicEnv();
  const clientIp = clientIpAddress(requestHeaders);
  const forwardedHeaders: Record<string, string> = {
    'User-Agent': requestHeaders.get('user-agent') ?? '',
    ...(clientIp ? { 'X-Forwarded-For': clientIp } : {}),
  };

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookieOptions: sessionCookieOptions,
      global: { headers: forwardedHeaders },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, { ...options, ...sessionCookieOptions });
            }
          } catch {
            // Server Components cannot set cookies; the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

export function createSupabaseAdminClient(): SupabaseClient {
  const env = serverEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
