// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it } from 'vitest';
import messages from '@agency-os/i18n/messages/pt-PT';
import type { VoiceNoteView } from '@/modules/voice-notes';
import { VoiceNotePlayer } from './voice-note-player';

afterEach(cleanup);

const NOTE: VoiceNoteView = {
  id: 'note-1',
  targetId: 'comment-1',
  authorId: 'user-1',
  status: 'transcribed',
  transcript: 'Mais contraste no logótipo.',
  durationSeconds: 42,
  createdAt: '2026-10-26T10:00:00.000Z',
  audioUrl: 'https://storage.example/note.webm',
};

function renderPlayer(note: Partial<VoiceNoteView> = {}) {
  render(
    <NextIntlClientProvider locale="pt-PT" messages={messages}>
      <VoiceNotePlayer note={{ ...NOTE, ...note }} />
    </NextIntlClientProvider>,
  );
}

describe('VoiceNotePlayer', () => {
  it('plays the note and shows the transcript under it', () => {
    renderPlayer();

    expect(screen.getByRole('button', { name: 'Reproduzir' })).toBeTruthy();
    expect(
      screen.getByRole('slider', { name: 'Posição da nota de voz' }).getAttribute('aria-valuemax'),
    ).toBe('42');
    expect(screen.getByText(/Mais contraste no logótipo\./)).toBeTruthy();
  });

  it('shows that the transcription is on its way', () => {
    renderPlayer({ status: 'uploaded', transcript: null });
    expect(screen.getByText('A transcrever…')).toBeTruthy();
  });

  it('says when the transcription failed', () => {
    renderPlayer({ status: 'failed', transcript: null });
    expect(screen.getByText('Não foi possível transcrever esta nota.')).toBeTruthy();
  });

  it('says when no speech was recognised', () => {
    renderPlayer({ transcript: '' });
    expect(screen.getByText('Sem fala reconhecida.')).toBeTruthy();
  });

  it('cannot play without an audio link', () => {
    renderPlayer({ audioUrl: null });
    expect((screen.getByRole('button', { name: 'Reproduzir' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
