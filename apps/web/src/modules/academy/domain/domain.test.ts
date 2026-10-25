import { describe, expect, it } from 'vitest';
import { itemInput, sessionInput } from './content';
import { checklistProgress } from './progress';

const FILE = '00000000-0000-4000-8000-000000000001';

describe('academy domain', () => {
  it('links must be https', () => {
    const tutorial = (url: string) =>
      itemInput({ kind: 'tutorial', title: 'Vídeo', description: '', source: { url } });
    expect(tutorial('https://youtu.be/abc')).toMatchObject({
      source: { url: 'https://youtu.be/abc' },
    });
    expect(tutorial('http://youtu.be/abc')).toBeNull();
    expect(tutorial('javascript:alert(1)')).toBeNull();
    expect(tutorial('https://')).toBeNull();
  });

  it('items by kind', () => {
    expect(
      itemInput({ kind: 'manual', title: ' Manual do CMS ', source: { libraryFileId: FILE } }),
    ).toEqual({
      kind: 'manual',
      title: 'Manual do CMS',
      description: '',
      source: { libraryFileId: FILE },
      steps: [],
    });
    expect(itemInput({ kind: 'manual', title: 'Sem fonte' })).toBeNull();
    expect(
      itemInput({ kind: 'checklist', title: 'Arranque', steps: [' Entrar ', '', 'Publicar'] }),
    ).toEqual({
      kind: 'checklist',
      title: 'Arranque',
      description: '',
      source: null,
      steps: ['Entrar', 'Publicar'],
    });
    expect(itemInput({ kind: 'checklist', title: 'Vazia', steps: [] })).toBeNull();
    expect(
      itemInput({
        kind: 'checklist',
        title: 'Longa',
        steps: Array.from({ length: 31 }, () => 'x'),
      }),
    ).toBeNull();
    expect(itemInput({ kind: 'quiz', title: 'X' })).toBeNull();
    expect(
      itemInput({ kind: 'manual', title: 'x'.repeat(121), source: { libraryFileId: FILE } }),
    ).toBeNull();
  });

  it('sessions validate guests and duration', () => {
    expect(
      sessionInput({
        heldOn: '2026-10-14',
        title: 'Formação do CMS',
        durationMinutes: 90,
        summary: '',
        participantIds: [FILE],
        guests: [' Ana Costa ', ''],
        materialIds: [],
      }),
    ).toEqual({
      heldOn: '2026-10-14',
      title: 'Formação do CMS',
      durationMinutes: 90,
      summary: '',
      participantIds: [FILE],
      guests: ['Ana Costa'],
      materialIds: [],
    });
    const base = {
      heldOn: '2026-10-14',
      title: 'X',
      participantIds: [],
      guests: [],
      materialIds: [],
    };
    expect(sessionInput({ ...base, durationMinutes: null })).toMatchObject({
      durationMinutes: null,
    });
    expect(sessionInput({ ...base, durationMinutes: 601 })).toBeNull();
    expect(sessionInput({ ...base, heldOn: '14/10/2026' })).toBeNull();
    expect(
      sessionInput({ ...base, guests: Array.from({ length: 11 }, () => 'Convidado') }),
    ).toBeNull();
  });

  it('progress counts checked steps', () => {
    expect(checklistProgress(['s1', 's2', 's3'], new Set(['s2', 'other']))).toEqual({
      done: 1,
      total: 3,
    });
    expect(checklistProgress([], new Set())).toEqual({ done: 0, total: 0 });
  });
});
