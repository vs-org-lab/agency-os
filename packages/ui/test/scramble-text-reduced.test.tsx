// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ScrambleText } from '../src/components/scramble-text';
import { installMatchMedia } from './match-media';

beforeAll(() => installMatchMedia(true));
afterEach(cleanup);

describe('ScrambleText with reduced motion', () => {
  it('renders the final text immediately', () => {
    const { container } = render(<ScrambleText text="Resultado guardado" />);
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('Resultado guardado');
  });
});
