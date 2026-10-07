export type ApplyActionState =
  | { status: 'idle' }
  | { status: 'throttled' }
  | { status: 'invalid'; questionIds: string[] }
  | { status: 'error' };

export const CONSENT_TEXT_VERSION = '2026-10';

export const HONEYPOT_FIELD = 'company_fax';
