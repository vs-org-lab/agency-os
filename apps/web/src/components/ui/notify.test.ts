import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
vi.mock('sonner', () => ({ toast }));

import { notify } from './notify';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notify', () => {
  it('delegates success to the toaster', () => {
    notify.success('Saved');
    expect(toast.success).toHaveBeenCalledWith('Saved', undefined);
  });

  it('passes the action through on success', () => {
    const onClick = vi.fn();
    notify.success('Saved', { action: { label: 'Undo', onClick } });
    expect(toast.success).toHaveBeenCalledWith('Saved', { action: { label: 'Undo', onClick } });
  });

  it('delegates error and info', () => {
    notify.error('Failed');
    notify.info('FYI');
    expect(toast.error).toHaveBeenCalledWith('Failed');
    expect(toast.info).toHaveBeenCalledWith('FYI');
  });
});
