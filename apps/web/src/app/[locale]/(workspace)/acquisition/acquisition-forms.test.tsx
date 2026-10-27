// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { MotionProvider } from '@agency-os/ui/motion';
import { TargetDialog } from './acquisition-forms';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/acquisition',
  useRouter: () => ({ replace: navigation.replace }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('new=1'),
}));

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDialog(openRequested: boolean) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      <MotionProvider>
        <TargetDialog
          action={async () => ({ status: 'idle' })}
          defaults={null}
          idPrefix="new-target"
          openRequested={openRequested}
        />
      </MotionProvider>
    </NextIntlClientProvider>,
  );
}

describe('acquisition new target', () => {
  it('acquisition opens the create dialog with new=1 when allowed', async () => {
    renderDialog(true);
    expect(screen.getByRole('dialog', { name: 'Nova empresa-alvo' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(navigation.replace).toHaveBeenCalledWith('/acquisition');
  });

  it('stays closed without the request', () => {
    renderDialog(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
