import type { TranscriptionPort } from './port';

export const FAKE_TRANSCRIPT_TEXT = 'Transcrição automática de teste.';

export function createFakeTranscription(): TranscriptionPort {
  return {
    async transcribe() {
      return [{ start: 0, end: 2, text: FAKE_TRANSCRIPT_TEXT }];
    },
  };
}
