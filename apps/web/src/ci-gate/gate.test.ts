import { expect, it } from 'vitest';

it('fails on purpose to verify the CI gate', () => {
  expect(1).toBe(2);
});
