import { domainProviderFrom } from './domain-provider';
import { parseEmailEnv, parsePaymentsEnv, parseTranscriptionEnv } from './env';
import { receiptReaderFrom } from './receipt-reader';

export type StudioServiceKey =
  'payments' | 'email' | 'transcription' | 'receipts' | 'domains' | 'events';
export type StudioServiceStatus = 'active' | 'test' | 'missing';
export type StudioService = { key: StudioServiceKey; status: StudioServiceStatus };

type Source = Record<string, string | undefined>;

function paymentsStatus(source: Source): StudioServiceStatus {
  try {
    return parsePaymentsEnv(source).PAYMENTS_PROVIDER === 'fake' ? 'test' : 'active';
  } catch {
    return 'missing';
  }
}

function emailStatus(source: Source): StudioServiceStatus {
  try {
    return parseEmailEnv(source).EMAIL_TRANSPORT === 'capture' ? 'test' : 'active';
  } catch {
    return 'missing';
  }
}

function transcriptionStatus(source: Source): StudioServiceStatus {
  try {
    return parseTranscriptionEnv(source).TRANSCRIPTION_PROVIDER === 'fake' ? 'test' : 'active';
  } catch {
    return 'missing';
  }
}

function eventsStatus(source: Source): StudioServiceStatus {
  if (source.INNGEST_DEV) return 'test';
  return source.INNGEST_EVENT_KEY && source.INNGEST_SIGNING_KEY ? 'active' : 'missing';
}

/**
 * Configuration state of the studio-wide services, read from the existing environment schemas.
 * Only the provider kind leaves this function; keys, URLs and secrets never do.
 */
export function studioServices(source: Source = process.env): StudioService[] {
  const receipts = receiptReaderFrom(source);
  const domains = domainProviderFrom(source);
  return [
    { key: 'payments', status: paymentsStatus(source) },
    { key: 'email', status: emailStatus(source) },
    { key: 'transcription', status: transcriptionStatus(source) },
    {
      key: 'receipts',
      status: !receipts ? 'missing' : source.RECEIPT_READER === 'fake' ? 'test' : 'active',
    },
    {
      key: 'domains',
      status: !domains ? 'missing' : source.DOMAIN_PROVIDER === 'fake' ? 'test' : 'active',
    },
    { key: 'events', status: eventsStatus(source) },
  ];
}
