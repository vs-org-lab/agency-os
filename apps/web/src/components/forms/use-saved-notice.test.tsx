// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useSavedNotice } from './use-saved-notice';

describe('useSavedNotice', () => {
  it('does not call back while the state is idle or an error', () => {
    const onDone = vi.fn();
    const { rerender } = renderHook(({ state }) => useSavedNotice(state, onDone, 'Guardado.'), {
      initialProps: { state: { status: 'idle' } as { status: string } },
    });
    rerender({ state: { status: 'error' } });
    expect(onDone).not.toHaveBeenCalled();
  });

  it('calls back once per saved result, even in strict mode and across re-renders', () => {
    const onDone = vi.fn();
    const saved = { status: 'saved' };
    const { rerender } = renderHook(({ state }) => useSavedNotice(state, onDone, 'Guardado.'), {
      wrapper: StrictMode,
      initialProps: { state: { status: 'idle' } as { status: string } },
    });
    rerender({ state: saved });
    rerender({ state: saved });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith('Guardado.');
    rerender({ state: { status: 'saved' } });
    expect(onDone).toHaveBeenCalledTimes(2);
  });
});
