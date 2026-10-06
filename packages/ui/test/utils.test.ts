import { describe, expect, it } from 'vitest';
import { cn } from '../src/lib/utils';

describe('cn', () => {
  it('keeps text colour when a design-system font size is added', () => {
    expect(cn('text-primary-foreground', 'text-label')).toBe('text-primary-foreground text-label');
    expect(cn('text-sm', 'text-body')).toBe('text-body');
    expect(cn('text-caption', 'text-title')).toBe('text-title');
  });

  it('still resolves conflicting colours', () => {
    expect(cn('text-text', 'text-danger')).toBe('text-danger');
  });
});
