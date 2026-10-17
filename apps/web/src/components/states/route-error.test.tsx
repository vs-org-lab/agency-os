// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { RouteError } from './route-error';

const captureException = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  captureException: (error: unknown) => captureException(error),
}));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('route error', () => {
  it('a failed screen offers a retry and a way home', () => {
    const reset = vi.fn();
    const error = new Error('database unavailable');
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <RouteError error={error} reset={reset} home="/portal" />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Algo correu mal')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(reset).toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Voltar ao início' }).getAttribute('href')).toBe(
      '/portal',
    );
    expect(captureException).toHaveBeenCalledWith(error);
    expect(screen.queryByText('database unavailable')).toBeNull();
  });
});
