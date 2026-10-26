import { describe, expect, it } from 'vitest';
import {
  chaptersSchema,
  testimonialVideoConfirmSchema,
  testimonialVideoContentType,
} from './input';

const PROJECT = '5f1c2a4e-7d3b-4c6a-9e1f-2b8d4a6c0e13';

describe('testimonial video input', () => {
  it('reads the container of a recorder content type', () => {
    expect(testimonialVideoContentType('video/webm;codecs=vp9,opus')).toBe('video/webm');
    expect(testimonialVideoContentType('video/mp4')).toBe('video/mp4');
    expect(testimonialVideoContentType('video/quicktime')).toBeNull();
    expect(testimonialVideoContentType('audio/webm')).toBeNull();
  });

  it('keeps the chapters to the five questions', () => {
    expect(chaptersSchema.safeParse([{ index: 0, startedAtMs: 0 }]).success).toBe(true);
    expect(chaptersSchema.safeParse([{ index: 5, startedAtMs: 0 }]).success).toBe(false);
    expect(chaptersSchema.safeParse([{ index: 1, startedAtMs: -1 }]).success).toBe(false);
    expect(
      chaptersSchema.safeParse(Array.from({ length: 6 }, () => ({ index: 0, startedAtMs: 0 })))
        .success,
    ).toBe(false);
  });

  it('limits the recording to five minutes', () => {
    const parse = (durationSeconds: number) =>
      testimonialVideoConfirmSchema.safeParse({ projectId: PROJECT, durationSeconds, chapters: [] })
        .success;
    expect(parse(300)).toBe(true);
    expect(parse(301)).toBe(false);
    expect(parse(0)).toBe(false);
  });
});
