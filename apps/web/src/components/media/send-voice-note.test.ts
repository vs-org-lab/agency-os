import { describe, expect, it, vi } from 'vitest';
import { sendVoiceNote, type VoiceNoteActions } from './send-voice-note';

const RECORDING = {
  blob: new Blob([new Uint8Array([1])], { type: 'audio/webm' }),
  durationSeconds: 7,
  contentType: 'audio/webm',
};
const TARGET = { targetKind: 'proof_comment', targetId: 'comment-1' } as const;

function actions(overrides: Partial<VoiceNoteActions> = {}): VoiceNoteActions {
  return {
    start: vi.fn(async () => ({
      ok: true as const,
      voiceNoteId: 'note-1',
      uploadUrl: 'https://storage.example/upload',
    })),
    finish: vi.fn(async () => ({ ok: true as const })),
    ...overrides,
  };
}

describe('sendVoiceNote', () => {
  it('creates, uploads and confirms the note', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const steps = actions();

    expect(await sendVoiceNote(steps, TARGET, RECORDING)).toBe(true);
    expect(steps.start).toHaveBeenCalledWith({
      ...TARGET,
      contentType: 'audio/webm',
      durationSeconds: 7,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://storage.example/upload',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(steps.finish).toHaveBeenCalledWith('note-1');
    vi.unstubAllGlobals();
  });

  it('stops without confirming when the upload fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const steps = actions();

    expect(await sendVoiceNote(steps, TARGET, RECORDING)).toBe(false);
    expect(steps.finish).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('fails when the note cannot be created', async () => {
    const steps = actions({
      start: vi.fn(async () => ({ ok: false as const, code: 'not_found' })),
    });
    expect(await sendVoiceNote(steps, TARGET, RECORDING)).toBe(false);
  });
});
