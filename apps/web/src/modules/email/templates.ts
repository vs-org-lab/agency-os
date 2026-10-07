import { createTranslator } from 'next-intl';
import type { Locale } from '@agency-os/i18n';
import en from '@agency-os/i18n/messages/en';
import ptPT from '@agency-os/i18n/messages/pt-PT';

export const EMAIL_TEMPLATE_KEYS = [
  'lead.booking_link',
  'lead.booking_confirmed',
  'lead.call_reminder',
  'lead.booking_cancelled',
  'founder.application_received',
  'founder.queue_b_pending',
  'founder.call_outcome_missing',
  'founder.integration_unavailable',
  'founder.automation_failed',
] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

type LeadBase = { firstName: string; agencyName: string };
type CallDetails = LeadBase & { startsAtLabel: string; meetUrl: string | null; manageUrl: string };

export type EmailParams = {
  'lead.booking_link': LeadBase & { bookingUrl: string; expiresOn: string };
  'lead.booking_confirmed': CallDetails;
  'lead.call_reminder': CallDetails;
  'lead.booking_cancelled': LeadBase & { bookingUrl: string };
  'founder.application_received': {
    companyName: string;
    contactName: string;
    path: 'A' | 'B';
    score: number;
    costOfInaction: string;
    dealUrl: string;
  };
  'founder.queue_b_pending': { companyName: string; queueUrl: string };
  'founder.call_outcome_missing': { companyName: string; dealUrl: string };
  'founder.integration_unavailable': { integration: string; settingsUrl: string };
  'founder.automation_failed': { automation: string; occurredAt: string; appUrl: string };
};

export type RenderedEmail = { subject: string; html: string; text: string };

const ACTION_URL: { [K in EmailTemplateKey]: keyof EmailParams[K] } = {
  'lead.booking_link': 'bookingUrl',
  'lead.booking_confirmed': 'manageUrl',
  'lead.call_reminder': 'manageUrl',
  'lead.booking_cancelled': 'bookingUrl',
  'founder.application_received': 'dealUrl',
  'founder.queue_b_pending': 'queueUrl',
  'founder.call_outcome_missing': 'dealUrl',
  'founder.integration_unavailable': 'settingsUrl',
  'founder.automation_failed': 'appUrl',
};

const MESSAGES: Record<Locale, typeof ptPT> = { 'pt-PT': ptPT, en };

const COLORS = {
  canvas: '#fbfbfb',
  surface: '#ffffff',
  border: '#e7e8eb',
  text: '#0b1117',
  textSecondary: '#5b6672',
  primary: '#0b1117',
  primaryForeground: '#ffffff',
} as const;

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function translatorFor(locale: Locale, key: EmailTemplateKey) {
  return createTranslator({
    locale,
    messages: MESSAGES[locale],
    namespace: `email.${key}` as never,
    onError: (error) => {
      throw error;
    },
  }) as unknown as (messageKey: string, values?: Record<string, string | number>) => string;
}

function textValues(params: Record<string, unknown>): Record<string, string | number> {
  const values: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number') values[name] = value;
  }
  return values;
}

function layout(input: {
  lang: Locale;
  heading: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
  footer: string;
}): string {
  const paragraphs = input.paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${COLORS.text};">${escapeHtml(paragraph)}</p>`,
    )
    .join('');
  return [
    `<!doctype html><html lang="${input.lang}"><head><meta charset="utf-8">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    `<body style="margin:0;padding:0;background:${COLORS.canvas};font-family:${FONT_STACK};">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.canvas};padding:32px 16px;">`,
    '<tr><td align="center">',
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.surface};border:1px solid ${COLORS.border};border-radius:12px;">`,
    '<tr><td style="padding:32px;">',
    `<h1 style="margin:0 0 24px;font-size:20px;line-height:28px;font-weight:600;color:${COLORS.text};">${escapeHtml(input.heading)}</h1>`,
    paragraphs,
    `<a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;margin-top:8px;padding:12px 20px;background:${COLORS.primary};color:${COLORS.primaryForeground};border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(input.actionLabel)}</a>`,
    '</td></tr></table>',
    `<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:18px;color:${COLORS.textSecondary};">${escapeHtml(input.footer)}</p>`,
    '</td></tr></table></body></html>',
  ].join('');
}

export function renderEmail<K extends EmailTemplateKey>(
  key: K,
  locale: Locale,
  params: EmailParams[K],
): RenderedEmail {
  const t = translatorFor(locale, key);
  const values = textValues(params as Record<string, unknown>);
  const actionUrl = String((params as Record<string, unknown>)[ACTION_URL[key] as string]);

  const paragraphs = t('body', values)
    .split('\n\n')
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
  const meetUrl = (params as { meetUrl?: string | null }).meetUrl;
  if (meetUrl) paragraphs.push(t('meetLine', { meetUrl }));

  const heading = t('heading', values);
  const actionLabel = t('action', values);
  const footer = createTranslator({ locale, messages: MESSAGES[locale] })('email.footer');

  return {
    subject: t('subject', values),
    html: layout({ lang: locale, heading, paragraphs, actionLabel, actionUrl, footer }),
    text: [heading, ...paragraphs, `${actionLabel}: ${actionUrl}`, footer].join('\n\n'),
  };
}
