// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import {
  briefingGuideSchema,
  DEFAULT_BRIEFING_GUIDE,
  type BriefingGuide,
} from '@/modules/diagnosis';
import { BriefingGuideEditor } from './briefing-guide-editor';

afterEach(cleanup);

const WITHOUT_ONBOARDING: BriefingGuide = {
  blocks: DEFAULT_BRIEFING_GUIDE.blocks.map((block) => ({
    ...block,
    questions: block.questions.map(({ id, text }) => ({ id, text })),
  })),
  onboarding: [],
};

function editor(guide: BriefingGuide) {
  const publish = vi.fn(async (definition: BriefingGuide) => {
    void definition;
    return { ok: true as const, version: 2 };
  });
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <BriefingGuideEditor guide={guide} version={1} publish={publish} />
    </NextIntlClientProvider>,
  );
  return publish;
}

const published = (publish: ReturnType<typeof editor>) => {
  const call = publish.mock.calls.at(-1);
  if (!call) throw new Error('Nothing was published');
  return call[0];
};

describe('briefing guide editor', () => {
  it('suggested requests fill the onboarding and publish a valid guide', async () => {
    const publish = editor(WITHOUT_ONBOARDING);

    fireEvent.click(screen.getByRole('button', { name: 'Usar pedidos sugeridos' }));
    expect(screen.getByDisplayValue('Dê-nos acesso às suas redes sociais')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar nova versão' }));
    });

    const guide = published(publish);
    expect(briefingGuideSchema.safeParse(guide).success).toBe(true);
    expect(guide.onboarding.map((request) => request.id)).toContain('social_access');
  });

  it('a question with a yes or no answer can drive a request', async () => {
    const publish = editor(WITHOUT_ONBOARDING);
    const [answerField] = screen.getAllByLabelText('Resposta estruturada');
    if (!answerField) throw new Error('No answer field');

    fireEvent.change(answerField, { target: { value: 'yes_no' } });
    fireEvent.click(screen.getByRole('button', { name: 'Acrescentar pedido' }));
    fireEvent.change(screen.getByLabelText('Quando pedir'), { target: { value: 'answer' } });
    fireEvent.change(screen.getByLabelText('Quando a resposta é'), { target: { value: 'no' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Publicar nova versão' }));
    });

    const guide = published(publish);
    const question = guide.blocks[0]?.questions[0];
    expect(question?.answer).toEqual({ kind: 'yes_no' });
    expect(guide.onboarding[0]?.when).toEqual({
      type: 'answer',
      questionId: question?.id,
      equals: 'no',
    });
  });
});
