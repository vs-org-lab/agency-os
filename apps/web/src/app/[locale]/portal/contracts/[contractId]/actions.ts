'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { signContractAsClient } from '@/modules/contracts/server';
import { clientIpAddress } from '@/platform/request';
import { getVerifiedClaims } from '@/platform/session';

export type PortalSignResult = { ok: true } | { ok: false; code: string };

export async function signPortalContractAction(
  contractId: string,
  typedName: string,
  bodyHash: string,
): Promise<PortalSignResult> {
  const claims = await getVerifiedClaims();
  if (!claims) return { ok: false, code: 'not_found' };
  const requestHeaders = await headers();
  const result = await signContractAsClient(claims, {
    contractId,
    typedName,
    bodyHash,
    ipAddress: clientIpAddress(requestHeaders),
    userAgent: requestHeaders.get('user-agent'),
  });
  if (!result.ok) return { ok: false, code: result.rule };
  revalidatePath('/portal');
  revalidatePath(`/portal/contracts/${contractId}`);
  return { ok: true };
}
