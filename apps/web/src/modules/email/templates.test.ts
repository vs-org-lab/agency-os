import { describe, expect, it } from 'vitest';
import {
  EMAIL_TEMPLATE_KEYS,
  renderEmail,
  type EmailParams,
  type EmailTemplateKey,
} from './templates';

const SAMPLE_PARAMS: { [K in EmailTemplateKey]: EmailParams[K] } = {
  'lead.booking_link': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    bookingUrl: 'https://os.example.com/apply/book/token',
    expiresOn: '21 de outubro',
  },
  'lead.booking_confirmed': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    startsAtLabel: 'terça-feira, 13 de outubro, 10:00',
    meetUrl: 'https://meet.google.com/abc-defg-hij',
    manageUrl: 'https://os.example.com/apply/booking/token',
  },
  'lead.call_reminder': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    startsAtLabel: 'terça-feira, 13 de outubro, 10:00',
    meetUrl: null,
    manageUrl: 'https://os.example.com/apply/booking/token',
  },
  'lead.booking_cancelled': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    bookingUrl: 'https://os.example.com/apply/booking/token',
  },
  'lead.session_confirmed': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    startsAtLabel: 'quinta-feira, 15 de outubro, 11:00',
    joinUrl: 'https://meet.google.com/abc-defg-hij',
  },
  'lead.session_reminder': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    startsAtLabel: 'quinta-feira, 15 de outubro, 11:00',
    joinUrl: 'https://os.example.com/portal',
  },
  'lead.briefing_shared': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.presentation_shared': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.proposal_shared': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.contract_ready': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.contract_signed': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.payment_requested': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal/invoices',
  },
  'lead.payment_reminder': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal/invoices',
  },
  'lead.payment_overdue': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal/invoices',
  },
  'lead.payment_received': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal/invoices',
  },
  'founder.payment_received': {
    companyName: 'Empresa Exemplo',
    dealUrl: 'https://os.example.com/pipeline/deal',
  },
  'founder.payment_review': {
    companyName: 'Empresa Exemplo',
    dealUrl: 'https://os.example.com/pipeline/deal',
  },
  'founder.payment_overdue': {
    companyName: 'Empresa Exemplo',
    dealUrl: 'https://os.example.com/pipeline/deal',
    days: 15,
  },
  'founder.proposal_accepted': {
    companyName: 'Empresa Exemplo',
    optionName: 'Orbit com Gravity',
    dealUrl: 'https://os.example.com/pipeline/deal',
  },
  'founder.proposal_changes': {
    companyName: 'Empresa Exemplo',
    dealUrl: 'https://os.example.com/pipeline/deal',
  },
  'founder.contract_client_signed': {
    companyName: 'Empresa Exemplo',
    dealUrl: 'https://os.example.com/pipeline/deal',
  },
  'founder.contract_signed': {
    companyName: 'Empresa Exemplo',
    dealUrl: 'https://os.example.com/pipeline/deal',
  },
  'founder.application_received': {
    companyName: 'Empresa Exemplo',
    contactName: 'Ana Costa',
    path: 'A',
    score: 11,
    costOfInaction: 'Perdemos dois contratos por ano.',
    dealUrl: 'https://os.example.com/pipeline/deal',
  },
  'founder.queue_b_pending': {
    companyName: 'Empresa Exemplo',
    queueUrl: 'https://os.example.com/applications?tab=queue_b',
  },
  'founder.call_outcome_missing': {
    companyName: 'Empresa Exemplo',
    dealUrl: 'https://os.example.com/pipeline/deal',
  },
  'founder.integration_unavailable': {
    integration: 'Google Calendar',
    settingsUrl: 'https://os.example.com/settings/integrations',
  },
  'founder.automation_failed': {
    automation: 'call-reminders',
    occurredAt: '7 de outubro, 14:00',
    appUrl: 'https://os.example.com/',
  },
};

describe('renderEmail', () => {
  it('renders every template in both locales without missing keys', () => {
    for (const locale of ['pt-PT', 'en'] as const) {
      for (const key of EMAIL_TEMPLATE_KEYS) {
        const rendered = renderEmail(key, locale, SAMPLE_PARAMS[key] as never);
        expect(rendered.subject.trim(), `${locale} ${key}`).not.toBe('');
        expect(rendered.html, `${locale} ${key}`).toContain('<html');
        expect(rendered.text.trim(), `${locale} ${key}`).not.toBe('');
      }
    }
  });

  it('names the chosen option when a proposal is accepted', () => {
    const rendered = renderEmail(
      'founder.proposal_accepted',
      'pt-PT',
      SAMPLE_PARAMS['founder.proposal_accepted'],
    );

    expect(rendered.subject).toBe('Empresa Exemplo aceitou a proposta');
    expect(rendered.text).toContain('Orbit com Gravity');
    expect(rendered.html).toContain('https://os.example.com/pipeline/deal');
  });

  it('tells the founder how long a payment request is overdue', () => {
    const email = renderEmail('founder.payment_overdue', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      dealUrl: 'https://os.example.com/pipeline/deal',
      days: 30,
    });

    expect(email.subject).toBe('Pagamento de Empresa Exemplo em atraso há 30 dias');
  });

  it('escapes html in parameters', () => {
    const rendered = renderEmail('founder.application_received', 'pt-PT', {
      ...SAMPLE_PARAMS['founder.application_received'],
      companyName: '<script>alert(1)</script>',
    });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('includes exactly one action link', () => {
    for (const key of EMAIL_TEMPLATE_KEYS) {
      const rendered = renderEmail(key, 'pt-PT', SAMPLE_PARAMS[key] as never);
      expect(rendered.html.match(/<a /g) ?? [], key).toHaveLength(1);
    }
  });

  it('plain text contains the action url', () => {
    const rendered = renderEmail('lead.booking_link', 'en', SAMPLE_PARAMS['lead.booking_link']);
    expect(rendered.text).toContain('https://os.example.com/apply/book/token');
    expect(rendered.subject).toContain('Aurion');
  });

  it('shows the meeting link only when there is one', () => {
    const withMeet = renderEmail(
      'lead.booking_confirmed',
      'pt-PT',
      SAMPLE_PARAMS['lead.booking_confirmed'],
    );
    const withoutMeet = renderEmail(
      'lead.call_reminder',
      'pt-PT',
      SAMPLE_PARAMS['lead.call_reminder'],
    );
    expect(withMeet.text).toContain('https://meet.google.com/abc-defg-hij');
    expect(withoutMeet.text).not.toContain('meet.google.com');
  });
});
