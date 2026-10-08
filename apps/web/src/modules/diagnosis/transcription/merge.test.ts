import { describe, expect, it } from 'vitest';
import { appendTranscriptSection, mergeTracks, transcriptSection } from './merge';

describe('mergeTracks', () => {
  it('interleaves both tracks by time', () => {
    const transcript = mergeTracks([
      {
        speaker: 'Cliente',
        segments: [
          { start: 4, end: 9, text: ' Vendemos sobretudo online.' },
          { start: 20, end: 24, text: 'Cerca de metade.' },
        ],
      },
      {
        speaker: 'Aurion',
        segments: [
          { start: 0, end: 3, text: 'Como vendem hoje?' },
          { start: 12, end: 18, text: 'E qual a parte do digital?' },
        ],
      },
    ]);

    expect(transcript).toBe(
      [
        '[00:00] Aurion: Como vendem hoje?',
        '[00:04] Cliente: Vendemos sobretudo online.',
        '[00:12] Aurion: E qual a parte do digital?',
        '[00:20] Cliente: Cerca de metade.',
      ].join('\n\n'),
    );
  });

  it('merges consecutive segments of the same speaker', () => {
    const transcript = mergeTracks([
      {
        speaker: 'Cliente',
        segments: [
          { start: 5, end: 8, text: 'Temos duas lojas.' },
          { start: 8, end: 11, text: 'E uma loja online.' },
        ],
      },
      { speaker: 'Aurion', segments: [{ start: 1, end: 4, text: 'Fale-me do negócio.' }] },
    ]);

    expect(transcript).toBe(
      '[00:01] Aurion: Fale-me do negócio.\n\n[00:05] Cliente: Temos duas lojas. E uma loja online.',
    );
  });

  it('skips empty segments', () => {
    const transcript = mergeTracks([
      {
        speaker: 'Cliente',
        segments: [
          { start: 2, end: 3, text: '   ' },
          { start: 6, end: 9, text: 'Sim.' },
        ],
      },
      {
        speaker: 'Aurion',
        segments: [
          { start: 0, end: 1, text: 'Olá.' },
          { start: 4, end: 5, text: '' },
          { start: 10, end: 11, text: 'Ótimo.' },
        ],
      },
      { speaker: 'Aurion', segments: [] },
    ]);

    expect(transcript).toBe(
      '[00:00] Aurion: Olá.\n\n[00:06] Cliente: Sim.\n\n[00:10] Aurion: Ótimo.',
    );
    expect(mergeTracks([{ speaker: 'Cliente', segments: [{ start: 0, end: 1, text: ' ' }] }])).toBe(
      '',
    );
  });

  it('formats hours past sixty minutes as mm', () => {
    expect(
      mergeTracks([{ speaker: 'Aurion', segments: [{ start: 3725.6, end: 3730, text: 'Fim.' }] }]),
    ).toBe('[62:05] Aurion: Fim.');
  });

  it('keeps one timestamped line per segment without a speaker', () => {
    expect(
      mergeTracks([
        {
          speaker: null,
          segments: [
            { start: 0, end: 5, text: 'Primeira frase.' },
            { start: 65, end: 70, text: 'Segunda frase.' },
          ],
        },
      ]),
    ).toBe('[00:00] Primeira frase.\n\n[01:05] Segunda frase.');
  });
});

describe('transcript sections', () => {
  it('wraps the body under a dated header', () => {
    expect(transcriptSection('Gravação de 08/10/2026 14:30', 'Texto')).toBe(
      '— Gravação de 08/10/2026 14:30 —\n\nTexto',
    );
  });

  it('appends after the existing transcript without replacing it', () => {
    expect(appendTranscriptSection('Notas manuais\n', 'Secção')).toBe('Notas manuais\n\nSecção');
    expect(appendTranscriptSection(null, 'Secção')).toBe('Secção');
    expect(appendTranscriptSection('  ', 'Secção')).toBe('Secção');
  });
});
