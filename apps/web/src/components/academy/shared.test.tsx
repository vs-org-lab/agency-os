// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import { useShortDate } from './shared';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="pt-PT" messages={messages} timeZone="Europe/Lisbon">
      {children}
    </NextIntlClientProvider>
  );
}

describe('short date', () => {
  it('formats a calendar date, a serialised instant and a Date', () => {
    const { result } = renderHook(() => useShortDate(), { wrapper });

    expect(result.current('2026-10-25')).toBe('25/10/2026');
    expect(result.current('2026-10-25T09:30:00.000Z')).toBe('25/10/2026');
    expect(result.current(new Date('2026-10-25T09:30:00.000Z'))).toBe('25/10/2026');
  });
});
