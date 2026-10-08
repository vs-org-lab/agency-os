// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { FindingForm } from './finding-form';

afterEach(() => {
  cleanup();
});

describe('FindingForm', () => {
  it('proposes the lane from impact and effort until the lane is chosen by hand', () => {
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <FindingForm action={vi.fn(async () => ({ status: 'idle' as const }))} />
      </NextIntlClientProvider>,
    );
    const impact = screen.getByLabelText('Impacto') as HTMLSelectElement;
    const effort = screen.getByLabelText('Esforço') as HTMLSelectElement;
    const lane = screen.getByLabelText('Faixa') as HTMLSelectElement;

    fireEvent.change(impact, { target: { value: 'high' } });
    fireEvent.change(effort, { target: { value: 'low' } });
    expect(lane.value).toBe('days_30');

    fireEvent.change(effort, { target: { value: 'high' } });
    expect(lane.value).toBe('days_90');

    fireEvent.change(lane, { target: { value: 'months_12' } });
    fireEvent.change(effort, { target: { value: 'low' } });
    expect(lane.value).toBe('months_12');
  });
});
