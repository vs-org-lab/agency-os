// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClientAvatar } from '../src/components/client-avatar';

afterEach(cleanup);

function avatar(id: string, name: string) {
  const { container } = render(<ClientAvatar id={id} name={name} />);
  return container.querySelector('[data-slot="client-avatar"]') as HTMLElement;
}

describe('ClientAvatar', () => {
  it('same id always gives the same tone', () => {
    const first = avatar('0b8f7c1e-1', 'Alpha');
    const second = avatar('0b8f7c1e-1', 'Other name');
    expect(second.className).toBe(first.className);
  });

  it('two initials from the name', () => {
    expect(avatar('a', 'Ana Beatriz Costa').textContent).toBe('AC');
  });

  it('one initial for a single word', () => {
    expect(avatar('a', 'aurion').textContent).toBe('A');
  });

  it('never uses the gold token', () => {
    for (let index = 0; index < 50; index += 1) {
      expect(avatar(`id-${index}`, 'X Y').className).not.toContain('gold');
    }
  });
});
