import { z } from 'zod';

export const VOICE_NOTES_BUCKET = 'voice-notes';

export const MAX_VOICE_NOTE_SECONDS = 180;

/** The bucket limit; three minutes of compressed speech stay far below it. */
export const MAX_VOICE_NOTE_BYTES = 10_485_760;

export const VOICE_NOTE_EXTENSIONS = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'audio/mpeg': 'mp3',
} as const;

export type VoiceNoteContentType = keyof typeof VOICE_NOTE_EXTENSIONS;

export const VOICE_NOTE_TARGETS = ['proof_comment', 'approval_change_request'] as const;

export type VoiceNoteTargetKind = (typeof VOICE_NOTE_TARGETS)[number];

/** Browsers report the container with its codecs ("audio/webm;codecs=opus"); only the container counts. */
export function voiceNoteContentType(value: string): VoiceNoteContentType | null {
  const container = value.split(';')[0]?.trim().toLowerCase() ?? '';
  return Object.hasOwn(VOICE_NOTE_EXTENSIONS, container)
    ? (container as VoiceNoteContentType)
    : null;
}

export const createVoiceNoteSchema = z.object({
  targetKind: z.enum(VOICE_NOTE_TARGETS),
  targetId: z.uuid(),
  contentType: z.string().max(100),
  durationSeconds: z.number().int().min(1).max(MAX_VOICE_NOTE_SECONDS),
});

export type CreateVoiceNoteInput = z.input<typeof createVoiceNoteSchema>;

export type VoiceNoteView = {
  id: string;
  targetId: string;
  authorId: string | null;
  status: 'uploaded' | 'transcribed' | 'failed';
  transcript: string | null;
  durationSeconds: number;
  createdAt: string;
  /** A signed link that expires in minutes; null when the audio cannot be served. */
  audioUrl: string | null;
};
