import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadPanelData } from './panel-data';

const loadStudioTaskDetail = vi.fn();
const loadAttachableFiles = vi.fn();

vi.mock('@/modules/tasks/server', () => ({
  loadStudioTaskDetail: (...args: unknown[]) => loadStudioTaskDetail(...args) as unknown,
}));
vi.mock('@/modules/library/server', () => ({
  loadAttachableFiles: (...args: unknown[]) => loadAttachableFiles(...args) as unknown,
}));

const session = { claims: {} as never };
const TASK_ID = '0b5e7f10-1c1a-4a8e-9a55-2f6a0b1c2d3e';

beforeEach(() => {
  loadStudioTaskDetail.mockReset();
  loadAttachableFiles.mockReset();
  loadAttachableFiles.mockResolvedValue([{ id: 'f1' }]);
});

describe('loadPanelData', () => {
  it("refuses a task of another client's room and loads nothing for it", async () => {
    loadStudioTaskDetail.mockResolvedValue({ id: TASK_ID, clientId: 'client-b', projectId: 'p1' });

    const result = await loadPanelData(session, TASK_ID, 'client-a');

    expect(result).toEqual({ detail: null, attachable: [] });
    expect(loadAttachableFiles).not.toHaveBeenCalled();
  });

  it("opens a task of the room's own client", async () => {
    const found = { id: TASK_ID, clientId: 'client-a', projectId: 'p1' };
    loadStudioTaskDetail.mockResolvedValue(found);

    expect(await loadPanelData(session, TASK_ID, 'client-a')).toEqual({
      detail: found,
      attachable: [{ id: 'f1' }],
    });
  });

  it('opens any readable task on the studio page', async () => {
    const found = { id: TASK_ID, clientId: 'client-b', projectId: null };
    loadStudioTaskDetail.mockResolvedValue(found);

    expect(await loadPanelData(session, TASK_ID, null)).toEqual({ detail: found, attachable: [] });
  });

  it('opens nothing without a task param', async () => {
    expect(await loadPanelData(session, undefined, 'client-a')).toEqual({
      detail: null,
      attachable: [],
    });
    expect(loadStudioTaskDetail).not.toHaveBeenCalled();
  });
});
