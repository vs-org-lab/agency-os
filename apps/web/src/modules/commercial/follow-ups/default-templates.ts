import type { Locale } from '@agency-os/i18n';

export type DefaultFollowUpTemplate = {
  locale: Locale;
  sequenceDay: 3 | 7 | 14 | 30;
  name: string;
  body: string;
};

export const DEFAULT_FOLLOW_UP_TEMPLATES: readonly DefaultFollowUpTemplate[] = [
  {
    locale: 'pt-PT',
    sequenceDay: 3,
    name: 'Acompanhamento 3 dias',
    body: 'Olá {firstName}, obrigado pela conversa de {callDate}. Ficou alguma dúvida sobre o diagnóstico para a {companyName}? Se fizer sentido, avançamos com a proposta esta semana.',
  },
  {
    locale: 'pt-PT',
    sequenceDay: 7,
    name: 'Acompanhamento 7 dias',
    body: 'Olá {firstName}, retomo a nossa conversa de {callDate}. Há alguma decisão interna na {companyName} em que possa ajudar com informação concreta?',
  },
  {
    locale: 'pt-PT',
    sequenceDay: 14,
    name: 'Acompanhamento 14 dias',
    body: 'Olá {firstName}, sei que as prioridades mudam. Se o diagnóstico continuar a fazer sentido para a {companyName}, diga-me qual é o melhor momento para retomarmos.',
  },
  {
    locale: 'pt-PT',
    sequenceDay: 30,
    name: 'Acompanhamento 30 dias',
    body: 'Olá {firstName}, encerro por agora o seguimento da nossa conversa de {callDate}. Quando o momento for outro para a {companyName}, basta responder a esta mensagem.',
  },
  {
    locale: 'en',
    sequenceDay: 3,
    name: 'Follow-up 3 days',
    body: 'Hello {firstName}, thank you for the conversation on {callDate}. Is there anything unclear about the diagnosis for {companyName}? If it makes sense, we can move to the proposal this week.',
  },
  {
    locale: 'en',
    sequenceDay: 7,
    name: 'Follow-up 7 days',
    body: 'Hello {firstName}, picking up our conversation from {callDate}. Is there an internal decision at {companyName} I can support with concrete information?',
  },
  {
    locale: 'en',
    sequenceDay: 14,
    name: 'Follow-up 14 days',
    body: 'Hello {firstName}, I know priorities change. If the diagnosis still makes sense for {companyName}, let me know the best time to pick it up again.',
  },
  {
    locale: 'en',
    sequenceDay: 30,
    name: 'Follow-up 30 days',
    body: 'Hello {firstName}, I am closing the follow-up on our conversation from {callDate} for now. When the timing is different for {companyName}, just reply to this message.',
  },
];
