// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { LogoTraceLoader } from '../src/components/logo-trace-loader';
import { MotionProvider } from '../src/motion';
import { installMatchMedia } from './match-media';

beforeAll(() => installMatchMedia(true));
afterEach(cleanup);

describe('LogoTraceLoader with reduced motion', () => {
  it('shows the finished monogram without tracing it', () => {
    const { container } = render(
      <MotionProvider>
        <LogoTraceLoader />
      </MotionProvider>,
    );
    expect(
      container.querySelector('[data-slot="logo-trace-loader"]')?.getAttribute('data-motion'),
    ).toBe('static');
    for (const path of container.querySelectorAll('path')) {
      expect(path.getAttribute('stroke-dashoffset')).toBeNull();
      expect(path.getAttribute('fill')).toBe('currentColor');
    }
  });
});
