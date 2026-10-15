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
  'lead.room_update': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.step_shared': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.approval_requested': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.approval_reminder': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.proof_comment': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.rounds_warning': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal',
  },
  'lead.testimonial_request': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal/testimonial/project',
  },
  'lead.document_shared': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal/docs/doc',
  },
  'lead.document_comment': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal/docs/doc',
  },
  'lead.brand_hub_published': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/portal/hub',
  },
  'founder.document_comment': {
    companyName: 'Empresa Exemplo',
    documentTitle: 'Estratégia',
    roomUrl: 'https://os.example.com/c/client/docs/doc',
  },
  'lead.retainer_threshold': {
    firstName: 'Ana',
    agencyName: 'Aurion',
    portalUrl: 'https://os.example.com/pt-PT/portal/progress',
  },
  'founder.retainer_threshold': {
    companyName: 'Empresa Exemplo',
    kind: 'content_pieces',
    percent: 80,
    roomUrl: 'https://os.example.com/c/client/retainer',
  },
  'founder.retainer_extra_requested': {
    companyName: 'Empresa Exemplo',
    description: 'Campanha de Natal',
    roomUrl: 'https://os.example.com/c/client/retainer',
  },
  'founder.testimonial_received': {
    companyName: 'Empresa Exemplo',
    authorName: 'Marta Lopes',
    body: 'Trabalho excelente.',
    roomUrl: 'https://os.example.com/c/client',
  },
  'founder.approval_decided': {
    companyName: 'Empresa Exemplo',
    phaseName: 'Descoberta e arquitetura',
    decision: 'changes_requested',
    subject: 'phase',
    roomUrl: 'https://os.example.com/c/client',
  },
  'founder.approval_overdue': {
    companyName: 'Empresa Exemplo',
    phaseName: 'Descoberta e arquitetura',
    subject: 'file',
    roomUrl: 'https://os.example.com/c/client',
  },
  'founder.proof_comment': {
    companyName: 'Empresa Exemplo',
    fileTitle: 'Logótipo',
    roomUrl: 'https://os.example.com/c/client/proofs/version',
  },
  'founder.rounds_warning': {
    companyName: 'Empresa Exemplo',
    used: 3,
    limit: 3,
    roomUrl: 'https://os.example.com/c/client',
  },
  'founder.extra_round': {
    companyName: 'Empresa Exemplo',
    used: 4,
    limit: 3,
    roomUrl: 'https://os.example.com/c/client',
  },
  'team.invitation': {
    fullName: 'Rui Costa',
    agencyName: 'Aurion',
    role: 'freelancer',
    inviteUrl: 'https://os.example.com/accept-invitation?token_hash=hash&type=invite',
  },
  'team.task_assigned': {
    fullName: 'Rui Costa',
    title: 'Exportar o logótipo',
    scope: 'client',
    clientName: 'Empresa Exemplo',
    due: '16 de outubro',
    taskUrl: 'https://os.example.com/c/client/tasks',
  },
  'client.invitation': {
    fullName: 'Marta Lopes',
    agencyName: 'Aurion',
    clientName: 'Empresa Exemplo',
    role: 'operational',
    inviteUrl: 'https://os.example.com/accept-invitation?token_hash=hash&type=invite',
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
  it('retainer alerts have templates', () => {
    expect(EMAIL_TEMPLATE_KEYS).toEqual(
      expect.arrayContaining([
        'lead.retainer_threshold',
        'founder.retainer_threshold',
        'founder.retainer_extra_requested',
      ]),
    );
    const team = renderEmail('founder.retainer_threshold', 'pt-PT', {
      companyName: 'Bloom',
      kind: 'content_pieces',
      percent: 80,
      roomUrl: 'https://os.example.com/c/client/retainer',
    });
    expect(team.subject).toBe('Bloom usou 80% das peças de conteúdo do mês');
  });

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

  it('names the final delivery in approval alerts', () => {
    const decided = renderEmail('founder.approval_decided', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      phaseName: 'Website',
      decision: 'approved',
      subject: 'delivery',
      roomUrl: 'https://os.example.com/c/client',
    });
    const overdue = renderEmail('founder.approval_overdue', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      phaseName: 'Website',
      subject: 'delivery',
      roomUrl: 'https://os.example.com/c/client',
    });

    expect(decided.subject).toBe('Empresa Exemplo aprovou a entrega final de Website');
    expect(overdue.text).toContain('A entrega final de Website');
  });

  it('names documents in approval alerts', () => {
    const decided = renderEmail('founder.approval_decided', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      phaseName: 'Estratégia',
      decision: 'changes_requested',
      subject: 'document',
      roomUrl: 'https://os.example.com/c/client/docs/doc',
    });
    const overdue = renderEmail('founder.approval_overdue', 'en', {
      companyName: 'Empresa Exemplo',
      phaseName: 'Estratégia',
      subject: 'document',
      roomUrl: 'https://os.example.com/c/client/docs/doc',
    });

    expect(decided.subject).toBe('Empresa Exemplo pediu alterações no documento Estratégia');
    expect(decided.text).toContain('Rever documento');
    expect(overdue.text).toContain('The document Estratégia');
  });

  it('names the brand hub in approval alerts', () => {
    const decided = renderEmail('founder.approval_decided', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      phaseName: 'Brand Hub',
      decision: 'changes_requested',
      subject: 'brand_hub',
      roomUrl: 'https://os.example.com/c/client/hub',
    });
    const approved = renderEmail('founder.approval_decided', 'en', {
      companyName: 'Empresa Exemplo',
      phaseName: 'Brand Hub',
      decision: 'approved',
      subject: 'brand_hub',
      roomUrl: 'https://os.example.com/c/client/hub',
    });
    const overdue = renderEmail('founder.approval_overdue', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      phaseName: 'Brand Hub',
      subject: 'brand_hub',
      roomUrl: 'https://os.example.com/c/client/hub',
    });

    expect(decided.subject).toBe('Empresa Exemplo pediu alterações no Brand Hub');
    expect(decided.text).toContain('Rever Brand Hub');
    expect(approved.subject).toBe('Empresa Exemplo approved the Brand Hub');
    expect(overdue.text).toContain('O Brand Hub espera');
  });

  it('document notices name the document and open it', () => {
    const team = renderEmail('founder.document_comment', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      documentTitle: 'Estratégia',
      roomUrl: 'https://os.example.com/c/client/docs/doc',
    });
    const client = renderEmail('lead.document_shared', 'en', {
      firstName: 'Ana',
      agencyName: 'Aurion',
      portalUrl: 'https://os.example.com/portal/docs/doc',
    });

    expect(team.subject).toBe('Novo comentário de Empresa Exemplo em Estratégia');
    expect(team.html).toContain('https://os.example.com/c/client/docs/doc');
    expect(client.html).toContain('https://os.example.com/portal/docs/doc');
  });

  it('the brand hub notice says the hub was updated and opens it', () => {
    const email = renderEmail('lead.brand_hub_published', 'pt-PT', {
      firstName: 'Ana',
      agencyName: 'Aurion',
      portalUrl: 'https://os.example.com/portal/hub',
    });

    expect(email.subject).toBe('O Brand Hub foi atualizado');
    expect(email.html).toContain('https://os.example.com/portal/hub');
  });

  it('the testimonial alert quotes what the client wrote', () => {
    const email = renderEmail('founder.testimonial_received', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      authorName: 'Marta Lopes',
      body: 'Trabalho excelente.',
      roomUrl: 'https://os.example.com/c/client',
    });

    expect(email.subject).toBe('Testemunho de Empresa Exemplo');
    expect(email.text).toContain('Trabalho excelente.');
  });

  it('tells the founder how long a payment request is overdue', () => {
    const email = renderEmail('founder.payment_overdue', 'pt-PT', {
      companyName: 'Empresa Exemplo',
      dealUrl: 'https://os.example.com/pipeline/deal',
      days: 30,
    });

    expect(email.subject).toBe('Pagamento de Empresa Exemplo em atraso há 30 dias');
  });

  it('tells the team whether the client approved or asked for changes', () => {
    const params = {
      companyName: 'Empresa Exemplo',
      phaseName: 'Descoberta e arquitetura',
      subject: 'phase' as const,
      roomUrl: 'https://os.example.com/c/client',
    };
    expect(
      renderEmail('founder.approval_decided', 'pt-PT', { ...params, decision: 'approved' }).subject,
    ).toBe('Empresa Exemplo aprovou a fase Descoberta e arquitetura');
    expect(
      renderEmail('founder.approval_decided', 'pt-PT', { ...params, decision: 'changes_requested' })
        .subject,
    ).toBe('Empresa Exemplo pediu alterações na fase Descoberta e arquitetura');
  });

  it('names the file when the decision is on a file', () => {
    expect(
      renderEmail('founder.approval_decided', 'pt-PT', {
        companyName: 'Empresa Exemplo',
        phaseName: 'Logótipo',
        subject: 'file',
        decision: 'changes_requested',
        roomUrl: 'https://os.example.com/c/client',
      }).subject,
    ).toBe('Empresa Exemplo pediu alterações no ficheiro Logótipo');
    expect(
      renderEmail('founder.extra_round', 'pt-PT', {
        companyName: 'Empresa Exemplo',
        used: 4,
        limit: 3,
        roomUrl: 'https://os.example.com/c/client',
      }).text,
    ).toContain('limite de 3 rondas (4 usadas)');
  });

  it('invites a team member with their role', () => {
    const email = renderEmail('team.invitation', 'pt-PT', SAMPLE_PARAMS['team.invitation']);

    expect(email.subject).toBe('Convite para a equipa da Aurion');
    expect(email.text).toContain('como freelancer');
    expect(email.html).toContain('https://os.example.com/accept-invitation?token_hash=hash');
  });

  it('invites a client user to the portal of their company', () => {
    const email = renderEmail('client.invitation', 'en', SAMPLE_PARAMS['client.invitation']);

    expect(email.subject).toBe('Your invitation to the Aurion portal');
    expect(email.text).toContain('Empresa Exemplo');
    expect(email.text).toContain('as operational');
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
