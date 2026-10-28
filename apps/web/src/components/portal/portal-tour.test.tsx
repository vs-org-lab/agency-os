// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { PortalTour, startPortalTour } from './portal-tour';

afterEach(cleanup);

function tour(props: { autoStart: boolean; onFinish?: () => Promise<void> }) {
  const onFinish = props.onFinish ?? vi.fn(async () => undefined);
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <section data-tour="project">Projeto</section>
      <PortalTour autoStart={props.autoStart} onFinish={onFinish} />
    </NextIntlClientProvider>,
  );
  return onFinish;
}

describe('PortalTour', () => {
  it('opens on the first visit with the welcome and skips the stops that are not on screen', () => {
    tour({ autoStart: true });

    const dialog = screen.getByRole('dialog', { name: 'Bem-vindo ao seu portal' });
    expect(dialog.textContent).toContain('1 de 2');
  });

  it('records the visit once when the client skips it', () => {
    const onFinish = tour({ autoStart: true });

    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('walks to the end and finishes', () => {
    const onFinish = tour({ autoStart: true });

    fireEvent.click(screen.getByRole('button', { name: 'Seguinte' }));
    expect(screen.getByRole('dialog', { name: 'Está pronto' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Concluir' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('stays closed after the first visit until it is started again', () => {
    tour({ autoStart: false });
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => startPortalTour());

    expect(screen.getByRole('dialog', { name: 'Bem-vindo ao seu portal' })).toBeTruthy();
  });

  it('closes with Escape', () => {
    tour({ autoStart: true });

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
