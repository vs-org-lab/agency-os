// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { COUNTER_REFRESH_EVENT } from '@/components/shell/navigation-counter';
import { MarkApplicationsSeen } from './mark-seen';

vi.mock('@/i18n/navigation', () => ({ usePathname: () => '/applications' }));

afterEach(() => {
  cleanup();
});

describe('MarkApplicationsSeen', () => {
  it('records the visit after mounting and then refreshes the navigation counters', async () => {
    const order: string[] = [];
    const markSeen = vi.fn(async () => {
      order.push('marked');
    });
    const listener = () => order.push('refreshed');
    window.addEventListener(COUNTER_REFRESH_EVENT, listener);

    render(<MarkApplicationsSeen markSeen={markSeen} />);

    await waitFor(() => expect(order).toEqual(['marked', 'refreshed']));
    expect(markSeen).toHaveBeenCalledTimes(1);
    window.removeEventListener(COUNTER_REFRESH_EVENT, listener);
  });
});
