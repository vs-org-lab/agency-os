// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrambleText } from '../src/components/scramble-text';
import { installMatchMedia } from './match-media';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ScrambleText', () => {
  it('exposes only the final text to assistive technology', () => {
    installMatchMedia(false);
    const { container } = render(<ScrambleText text="Resultado guardado" />);
    const live = container.querySelector('[aria-live]');
    expect(live?.textContent).toContain('Resultado guardado');
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('scrambles while revealing and settles on the final text', () => {
    installMatchMedia(false);
    const { container } = render(<ScrambleText text="Resultado guardado" duration={400} />);
    const visible = () => container.querySelector('[aria-hidden="true"]')?.textContent;
    expect(visible()).toHaveLength('Resultado guardado'.length);
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(visible()).not.toBe('Resultado guardado');
    expect(visible()).toHaveLength('Resultado guardado'.length);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(visible()).toBe('Resultado guardado');
  });
});
