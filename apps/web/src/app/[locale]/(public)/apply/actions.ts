'use server';

import { headers } from 'next/headers';
import { getLocale } from 'next-intl/server';
import { isLocale } from '@agency-os/i18n';
import { redirect } from '@/i18n/navigation';
import { submitPublicApplication } from '@/modules/commercial/server';
import { logger } from '@/platform/logger';
import { commercialEnv } from '@/platform/env';
import { clientIpAddress } from '@/platform/request';
import { signToken } from '@/platform/signed-token';
import { HONEYPOT_FIELD, type ApplyActionState } from './apply-state';

const THANKS_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

function parseJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

export async function submitApplicationAction(
  _state: ApplyActionState,
  formData: FormData,
): Promise<ApplyActionState> {
  const requestLocale = await getLocale();
  const locale = isLocale(requestLocale) ? requestLocale : 'pt-PT';
  const embed = text(formData.get('embed')) === '1';

  let result;
  try {
    result = await submitPublicApplication({
      answers: parseJson(formData.get('answers')),
      source: parseJson(formData.get('source')),
      consentAccepted: text(formData.get('consent')) === 'on',
      consentTextVersion: text(formData.get('consentTextVersion')),
      honeypot: text(formData.get(HONEYPOT_FIELD)),
      startedAt: Number(text(formData.get('startedAt'))),
      ipAddress: clientIpAddress(await headers()),
      locale,
    });
  } catch (error) {
    logger.error('commercial.application_submit_failed', { error });
    return { status: 'error' };
  }

  if (result.status === 'throttled') return { status: 'throttled' };
  if (result.status === 'invalid') {
    return { status: 'invalid', questionIds: result.issues.map((issue) => issue.questionId) };
  }

  const query: Record<string, string> = embed ? { embed: '1' } : {};
  if (result.status === 'accepted') {
    query.ref = signToken(
      'apply_thanks',
      { applicationId: result.applicationId, path: result.path },
      commercialEnv().PUBLIC_LINK_SECRET,
      new Date(Date.now() + THANKS_TOKEN_TTL_MS),
    );
  }
  return redirect({ href: { pathname: '/apply/thanks', query }, locale });
}
