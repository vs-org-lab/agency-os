// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { ContractModule } from '@/modules/contracts';
import type { ProposalOptionInput } from '@/modules/contracts/server';
import { ModuleBuilder, PaymentPresets } from './module-builder';

afterEach(() => {
  cleanup();
});

function withIntl(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {node}
    </NextIntlClientProvider>,
  );
}

function Harness() {
  const [modules, setModules] = useState<ContractModule[]>([]);
  return (
    <ModuleBuilder
      prefix="option-0"
      modules={modules}
      locale="pt-PT"
      currency="EUR"
      onChange={setModules}
    />
  );
}

describe('ModuleBuilder', () => {
  it('switching a module on opens its parameters and previews its clauses', async () => {
    withIntl(<Harness />);
    expect(screen.queryByRole('region', { name: 'Cláusulas no contrato' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /Vídeo e motion graphics/ }));
    const videos = screen.getByLabelText('Vídeos por mês');
    await userEvent.clear(videos);
    await userEvent.type(videos, '8');

    const preview = screen.getByRole('region', { name: 'Cláusulas no contrato' });
    expect(within(preview).getByText('Módulo A — Vídeo e motion graphics')).toBeTruthy();
    expect(within(preview).getByText('Volume contratado: 8 vídeos por mês.')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Gestão de redes sociais/ }));
    expect(within(preview).getByText('Solução integrada')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Vídeo e motion graphics/ }));
    expect(screen.queryByLabelText('Vídeos por mês')).toBeNull();
  });
});

describe('PaymentPresets', () => {
  it('applies the three-instalment plan', async () => {
    const onApply = vi.fn();
    withIntl(<PaymentPresets locale="pt-PT" onApply={onApply} />);

    await userEvent.click(screen.getByRole('button', { name: 'B · Três parcelas' }));
    const change = onApply.mock.calls[0]?.[0] as (
      option: ProposalOptionInput,
    ) => ProposalOptionInput;
    const next = change({
      name: 'Orbit',
      summary: '',
      scope: [],
      oneOffAmount: '9000',
      paymentPlan: [],
      retainerMonthly: null,
      retainerMonths: null,
    });
    expect(next.paymentPlan.map((step) => step.percent)).toEqual([33, 33, 34]);
    expect(next.retainerMonthly).toBeNull();
  });
});
