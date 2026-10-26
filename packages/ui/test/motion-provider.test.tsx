// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MotionProvider, useReducedMotion } from '../src/motion';
import { installMatchMedia } from './match-media';

function ReducedProbe() {
  return <span>{useReducedMotion() ? 'reduced' : 'full'}</span>;
}

afterEach(() => {
  installMatchMedia(false);
});

describe('MotionProvider', () => {
  it('renders children', () => {
    installMatchMedia(false);
    render(
      <MotionProvider>
        <p>child content</p>
      </MotionProvider>,
    );
    expect(screen.getByText('child content')).toBeTruthy();
  });

  it('uses reduced motion from the user setting', () => {
    installMatchMedia(true);
    render(
      <MotionProvider>
        <ReducedProbe />
      </MotionProvider>,
    );
    expect(screen.getByText('reduced')).toBeTruthy();
  });
});
