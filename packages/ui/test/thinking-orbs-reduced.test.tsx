// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ThinkingOrbs } from '../src/components/thinking-orbs';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

beforeAll(() => installMatchMedia(true));
afterEach(cleanup);

describe('ThinkingOrbs with reduced motion', () => {
  it('shows one static dot and the label', () => {
    const { container } = render(
      <MotionProvider>
        <ThinkingOrbs label="A pensar…" />
      </MotionProvider>,
    );
    expect(
      container.querySelector('[data-slot="thinking-orbs"]')?.getAttribute('data-motion'),
    ).toBe('static');
    expect(container.querySelectorAll('[data-orb]').length).toBe(1);
    expect(screen.getByRole('status').textContent).toContain('A pensar…');
  });
});
