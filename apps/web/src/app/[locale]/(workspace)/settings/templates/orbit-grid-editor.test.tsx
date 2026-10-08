// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { DEFAULT_ORBIT_GRID } from '@/modules/diagnosis';
import { OrbitGridEditor } from './orbit-grid-editor';

afterEach(() => {
  cleanup();
});

describe('OrbitGridEditor', () => {
  it('publish is disabled until every front sums to 25', () => {
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <OrbitGridEditor
          grid={DEFAULT_ORBIT_GRID}
          version={1}
          publish={vi.fn(async () => ({ ok: true as const, version: 2 }))}
        />
      </NextIntlClientProvider>,
    );
    const publish = screen.getByRole('button', {
      name: 'Publicar nova versão',
    }) as HTMLButtonElement;
    expect(publish.disabled).toBe(false);

    const [firstMaximum] = screen.getAllByLabelText('Pontos máximos') as HTMLInputElement[];
    if (!firstMaximum) throw new Error('criterion maximum missing');
    fireEvent.change(firstMaximum, { target: { value: '4' } });

    expect(publish.disabled).toBe(true);
    expect(screen.getByText('24 de 25')).toBeTruthy();
  });
});
