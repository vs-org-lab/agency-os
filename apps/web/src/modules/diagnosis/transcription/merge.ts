export type TranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type SpeakerTrack = {
  speaker: string | null;
  segments: TranscriptSegment[];
};

type Utterance = {
  track: number;
  speaker: string | null;
  start: number;
  text: string;
};

function timestamp(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function paragraph(utterance: Utterance): string {
  const label = utterance.speaker ? `${utterance.speaker}: ` : '';
  return `[${timestamp(utterance.start)}] ${label}${utterance.text}`;
}

/**
 * Interleaves the segments of every track by start time. Consecutive segments of the same
 * labelled track form one paragraph; unlabelled tracks keep one line per segment.
 */
export function mergeTracks(tracks: SpeakerTrack[]): string {
  const segments = tracks
    .flatMap((track, index) =>
      track.segments.map((segment) => ({
        track: index,
        speaker: track.speaker,
        start: segment.start,
        text: segment.text.trim(),
      })),
    )
    .filter((segment) => segment.text.length > 0)
    .sort((left, right) => left.start - right.start || left.track - right.track);

  const utterances: Utterance[] = [];
  for (const segment of segments) {
    const previous = utterances.at(-1);
    if (previous && previous.speaker && previous.track === segment.track) {
      previous.text = `${previous.text} ${segment.text}`;
    } else {
      utterances.push({ ...segment });
    }
  }

  return utterances.map(paragraph).join('\n\n');
}

export function transcriptSection(header: string, body: string): string {
  return `— ${header} —\n\n${body}`;
}

export function appendTranscriptSection(existing: string | null, section: string): string {
  const current = existing?.trimEnd() ?? '';
  return current.trim().length > 0 ? `${current}\n\n${section}` : section;
}
