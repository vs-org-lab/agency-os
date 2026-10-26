// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ThinkingOrbs } from '../src/components/thinking-orbs';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

afterEach(cleanup);

function renderOrbs() {
  installMatchMedia(false);
  return render(
    <MotionProvider>
      <ThinkingOrbs label="A pensar…" />
    </MotionProvider>,
  );
}

describe('ThinkingOrbs', () => {
  it('announces the label as a status', () => {
    renderOrbs();
    expect(screen.getByRole('status').textContent).toContain('A pensar…');
  });

  it('animates three orbs by default', () => {
    const { container } = renderOrbs();
    expect(
      container.querySelector('[data-slot="thinking-orbs"]')?.getAttribute('data-motion'),
    ).toBe('animated');
    expect(container.querySelectorAll('[data-orb]').length).toBe(3);
  });
});
