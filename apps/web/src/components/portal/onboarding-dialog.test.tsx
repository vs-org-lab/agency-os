// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@agency-os/ui/motion';
import messages from '@agency-os/i18n/messages/pt-PT';
import { OnboardingDialog } from './onboarding-dialog';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

afterEach(cleanup);

function dialog(props: { preview?: boolean; onSeen?: () => Promise<void> } = {}) {
  const onSeen = props.onSeen ?? vi.fn(async () => undefined);
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <OnboardingDialog preview={props.preview} onSeen={onSeen} />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
  return onSeen;
}

describe('OnboardingDialog', () => {
  it('shows once until dismissed', async () => {
    const user = userEvent.setup();
    const onSeen = dialog();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Onde vê o seu trabalho')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Seguinte' }));
    expect(screen.getByText('Como aprova')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Onde vê o seu trabalho')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Seguinte' }));
    await user.click(screen.getByRole('button', { name: 'Seguinte' }));
    expect(screen.getByText('Como pede trabalho')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Seguinte' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Começar' }));

    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('skip marks it seen', async () => {
    const user = userEvent.setup();
    const onSeen = dialog();

    await user.click(screen.getByRole('button', { name: 'Saltar' }));

    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('escape skips and marks it seen', async () => {
    const user = userEvent.setup();
    const onSeen = dialog();

    await user.keyboard('{Escape}');

    expect(onSeen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('never renders in staff preview', () => {
    const onSeen = dialog({ preview: true });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSeen).not.toHaveBeenCalled();
  });

  it('marks the current step with the indicator', async () => {
    const user = userEvent.setup();
    dialog();

    const steps = screen.getByRole('list', { name: 'Passo 1 de 3' }).querySelectorAll('li');
    expect(steps[0]?.getAttribute('aria-current')).toBe('step');
    await user.click(screen.getByRole('button', { name: 'Seguinte' }));
    expect(
      screen
        .getByRole('list', { name: 'Passo 2 de 3' })
        .querySelectorAll('li')[1]
        ?.getAttribute('aria-current'),
    ).toBe('step');
  });
});
