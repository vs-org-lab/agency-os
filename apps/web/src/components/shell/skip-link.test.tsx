// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SkipLink } from './skip-link';

afterEach(cleanup);

describe('skip link', () => {
  it('targets the main landmark and stays hidden until focused', () => {
    render(<SkipLink label="Saltar para o conteúdo" />);

    const link = screen.getByRole('link', { name: 'Saltar para o conteúdo' });
    expect(link.getAttribute('href')).toBe('#main');
    expect(link.className).toContain('sr-only');
    expect(link.className).toContain('focus:not-sr-only');
  });
});
