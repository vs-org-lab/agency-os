// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ClientOnboardingView } from '@/modules/client-onboarding';
import type { CoreOnboarding, OnboardingRequest } from '@/modules/diagnosis';
import { OnboardingList } from './onboarding-list';
import { OnboardingPlan, useOnboardingAnswers } from './onboarding-plan';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }));

afterEach(cleanup);

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

const request = (
  id: string,
  kind: OnboardingRequest['kind'],
  when: OnboardingRequest['when'] = { type: 'always' },
): OnboardingRequest => ({
  id,
  kind,
  title: { 'pt-PT': `Pedido ${id}`, en: `Request ${id}` },
  body: { 'pt-PT': 'Explicação', en: 'Explanation' },
  when,
});

const VIEW: ClientOnboardingView = {
  engagementId: 'engagement-1',
  canUpload: false,
  items: [
    {
      request: request('done', 'confirm'),
      done: true,
      response: '',
      completedAt: '2026-10-20T10:00:00.000Z',
      respondedByName: 'Maria Santos',
    },
    {
      request: request('refs', 'text'),
      done: false,
      response: '',
      completedAt: null,
      respondedByName: null,
    },
    {
      request: request('brand', 'upload'),
      done: false,
      response: '',
      completedAt: null,
      respondedByName: null,
    },
  ],
};

const actions = () => ({
  respond: vi.fn(async () => ({ ok: true as const })),
  folder: vi.fn(async () => ({ ok: true as const, folderId: 'folder-1' })),
  startUploads: vi.fn(async () => ({ ok: true as const, uploads: [] })),
  finishUpload: vi.fn(async () => ({ ok: true as const })),
});

describe('portal onboarding list', () => {
  it('puts open requests first and shows the progress', () => {
    withIntl(<OnboardingList view={VIEW} actions={actions()} />);

    const titles = screen
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(['Pedido refs', 'Pedido brand', 'Pedido done']);
    expect(screen.getByRole('progressbar', { name: '1 de 3 feitos' })).toBeTruthy();
  });

  it('a written request asks for words before sending', async () => {
    const list = actions();
    list.respond.mockResolvedValueOnce({ ok: false, code: 'response_required' } as never);
    withIntl(<OnboardingList view={VIEW} actions={list} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }));
    });

    expect(list.respond).toHaveBeenCalledWith('refs', '');
    expect(screen.getByText('Escreva a sua resposta antes de enviar.')).toBeTruthy();
  });

  it('files wait for the project when there is none yet', () => {
    withIntl(<OnboardingList view={VIEW} actions={actions()} />);

    expect(screen.getByText('Poderá enviar ficheiros assim que o projeto começar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Escolher ficheiros' })).toBeNull();
  });
});

const ONBOARDING: CoreOnboarding = {
  questions: [
    {
      blockId: 'brand_today',
      question: {
        id: 'has_visual_identity',
        text: { 'pt-PT': 'Já têm identidade visual?', en: 'Visual identity?' },
        answer: { kind: 'yes_no' },
      },
    },
  ],
  requests: [
    request('brand_files', 'upload', {
      type: 'answer',
      questionId: 'has_visual_identity',
      equals: 'yes',
    }),
    request('social', 'access', { type: 'module', code: 'B' }),
    request('refs', 'text'),
  ],
  answers: {},
  modules: [],
};

function Plan({ save }: { save: (...args: unknown[]) => Promise<boolean> }) {
  const state = useOnboardingAnswers({}, save);
  return <OnboardingPlan onboarding={ONBOARDING} state={state} />;
}

describe('onboarding plan during the briefing', () => {
  it('shows what will be asked as the answers come in', async () => {
    const save = vi.fn(async () => true);
    withIntl(<Plan save={save} />);

    const brand = () => screen.getByText('Pedido brand_files').closest('li');
    expect(brand()?.textContent).toContain('Depende da resposta');
    expect(screen.getByText('Pedido social').closest('li')?.textContent).toContain(
      'Se o contrato incluir Redes sociais',
    );
    expect(screen.getByText('Pedido refs').closest('li')?.textContent).toContain('Vai ser pedido');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Sim' }));
    });

    expect(save).toHaveBeenCalledWith('brand_today', 'has_visual_identity', 'yes');
    expect(brand()?.textContent).toContain('Vai ser pedido');
  });

  it('puts the answer back when it could not be saved', async () => {
    const save = vi.fn(async () => false);
    withIntl(<Plan save={save} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Não' }));
    });

    expect(screen.getByRole('button', { name: 'Não' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Não foi possível guardar a resposta.')).toBeTruthy();
  });
});
