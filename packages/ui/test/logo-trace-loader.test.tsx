// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LogoTraceLoader } from '../src/components/logo-trace-loader';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

beforeAll(() => installMatchMedia(false));
afterEach(cleanup);

describe('LogoTraceLoader', () => {
  it('traces the four strokes of the monogram and stays out of the accessibility tree', () => {
    const { container } = render(
      <MotionProvider>
        <LogoTraceLoader />
      </MotionProvider>,
    );
    const root = container.querySelector('[data-slot="logo-trace-loader"]');
    expect(root?.getAttribute('data-motion')).toBe('animated');
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(4);
    for (const path of paths) expect(path.getAttribute('pathLength')).toBe('1');
  });
});
