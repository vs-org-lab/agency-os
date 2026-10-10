import { describe, expect, it } from 'vitest';
import { settingsNavItems } from './settings-items';

describe('settingsNavItems', () => {
  it('settings navigation lists team for founders', () => {
    expect(settingsNavItems(true).map((item) => item.href)).toContain('/settings/team');
    expect(settingsNavItems(false).map((item) => item.href)).toEqual(['/settings/sessions']);
  });
});
