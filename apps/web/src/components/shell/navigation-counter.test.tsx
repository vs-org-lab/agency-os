// @vitest-environment jsdom
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  COUNTER_REFRESH_EVENT,
  CounterValue,
  formatCounter,
  useLiveCounter,
} from './navigation-counter';

const pathname = { current: '/' };

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => pathname.current,
}));

afterEach(() => {
  cleanup();
  pathname.current = '/';
});

describe('formatCounter', () => {
  it('hides zero and caps large counts', () => {
    expect(formatCounter(0)).toBeNull();
    expect(formatCounter(3)).toBe('3');
    expect(formatCounter(9)).toBe('9');
    expect(formatCounter(12)).toBe('9+');
  });
});

describe('useLiveCounter', () => {
  it('starts from the server count without fetching', () => {
    const refresh = vi.fn(async () => 7);

    const { result } = renderHook(() => useLiveCounter(2, refresh));

    expect(result.current).toBe(2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes when the window regains focus', async () => {
    const refresh = vi.fn(async () => 4);
    const { result } = renderHook(() => useLiveCounter(1, refresh));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(result.current).toBe(4));
  });

  it('refreshes on the refresh event and after navigation', async () => {
    const values = [0, 5];
    const refresh = vi.fn(async () => values.shift() ?? 0);
    const { result, rerender } = renderHook(() => useLiveCounter(3, refresh));

    act(() => {
      window.dispatchEvent(new Event(COUNTER_REFRESH_EVENT));
    });
    await waitFor(() => expect(result.current).toBe(0));

    pathname.current = '/pipeline';
    rerender();
    await waitFor(() => expect(result.current).toBe(5));
  });

  it('keeps the last value when the refresh fails', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('offline');
    });
    const { result } = renderHook(() => useLiveCounter(2, refresh));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(result.current).toBe(2);
  });
});

describe('CounterValue', () => {
  it('shows 9+ above nine without an animated number', () => {
    const { container } = render(<CounterValue count={10} locale="pt-PT" />);

    expect(container.textContent).toBe('9+');
    expect(container.querySelector('number-flow-react')).toBeNull();
  });

  it('animates numeric counts up to nine', () => {
    const { container } = render(<CounterValue count={9} locale="pt-PT" />);

    expect(container.querySelector('number-flow-react')).not.toBeNull();
  });

  it('renders nothing for an empty count', () => {
    const { container } = render(<CounterValue count={0} locale="pt-PT" />);

    expect(container.firstChild).toBeNull();
  });
});
