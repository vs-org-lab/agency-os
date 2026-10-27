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

  it('announces loading once and leaves the shimmer to the reduced-motion aware stylesheet', () => {
    const { container } = render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <RouteLoading shape="cards" />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByRole('status')).toHaveLength(1);
    const bars = container.querySelectorAll('[data-slot="skeleton"]');
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) expect(bar.className).toContain('skeleton');
  });

  it('shows the monogram only when branded', () => {
    const { container, rerender } = render(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <RouteLoading />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector('[data-slot="logo-trace-loader"]')).toBeNull();
    rerender(
      <NextIntlClientProvider locale="pt-PT" messages={messages}>
        <RouteLoading branded />
      </NextIntlClientProvider>,
    );
    expect(container.querySelector('[data-slot="logo-trace-loader"]')).not.toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});
