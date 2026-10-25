// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { RouteLoading } from './route-loading';

afterEach(cleanup);

describe('route loading', () => {
  it('announces a busy region with a screen-reader label', () => {
    render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <RouteLoading />
      </NextIntlClientProvider>,
    );

    const region = screen.getByRole('status');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.textContent).toContain('A carregar…');
  });

  it('does not pulse when the reader prefers reduced motion', () => {
    const { container } = render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <RouteLoading />
      </NextIntlClientProvider>,
    );

    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) expect(bar.className).toContain('motion-reduce:animate-none');
  });
});
