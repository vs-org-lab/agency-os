import { describe, expect, it } from 'vitest';
import { createVoiceNoteSchema, voiceNoteContentType } from './domain';

const TARGET = '5f1c2a4e-7d3b-4c6a-9e1f-2b8d4a6c0e13';

describe('voice note domain', () => {
  it('reads the container of a recorder content type', () => {
    expect(voiceNoteContentType('audio/webm;codecs=opus')).toBe('audio/webm');
    expect(voiceNoteContentType('Audio/MP4')).toBe('audio/mp4');
    expect(voiceNoteContentType('audio/wav')).toBeNull();
    expect(voiceNoteContentType('video/webm')).toBeNull();
    expect(voiceNoteContentType('')).toBeNull();
  });

  it('keeps the duration between one second and three minutes', () => {
    const parse = (durationSeconds: number) =>
      createVoiceNoteSchema.safeParse({
        targetKind: 'proof_comment',
        targetId: TARGET,
        contentType: 'audio/webm',
        durationSeconds,
      }).success;
    expect(parse(1)).toBe(true);
    expect(parse(180)).toBe(true);
    expect(parse(0)).toBe(false);
    expect(parse(181)).toBe(false);
    expect(parse(2.5)).toBe(false);
  });

  it('accepts only the two note targets', () => {
    const parse = (targetKind: string) =>
      createVoiceNoteSchema.safeParse({
        targetKind,
        targetId: TARGET,
        contentType: 'audio/webm',
        durationSeconds: 5,
      }).success;
    expect(parse('approval_change_request')).toBe(true);
    expect(parse('task_comment')).toBe(false);
  });
});
