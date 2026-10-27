'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { ImageCompare } from '@agency-os/ui/components/image-compare';
import type { ProofKind } from '@agency-os/db';
import { sendVoiceNote, type VoiceNoteActions } from '@/components/media/send-voice-note';
import type { ProofAnchor, ProofCommentView } from '@/modules/proofing';
import type { VoiceNoteView } from '@/modules/voice-notes';
import { anchorLabel } from './anchor-format';
import { CommentForm } from './comment-form';
import { CommentList } from './comment-list';
import { ImageCanvas } from './image-canvas';
import { PdfCanvas } from './pdf-canvas';
import type { Pin } from './pins';
import type { ProofActionResult } from './proof-errors';
import { VideoPlayer } from './video-player';

export type NewProofComment = {
  body: string;
  anchor: ProofAnchor | null;
  internal: boolean;
  parentId?: string;
};

/**
 * The proof with its comments beside it (below it on narrow screens). Clicking the image or a
 * PDF page, or pausing the video and choosing "Comentar neste momento", pins the next comment.
 */
export function ProofViewer({
  kind,
  src,
  title,
  number,
  pages,
  previousVersion = null,
  comments,
  audience,
  canComment,
  addComment,
  resolveComment,
  voiceNotes = [],
  voiceActions,
}: {
  kind: ProofKind;
  src: string;
  title: string;
  number: number;
  pages: number | null;
  /** The version before this one, offered for comparison when both are images. */
  previousVersion?: { id: string; number: number } | null;
  comments: ProofCommentView[];
  audience: 'team' | 'client';
  canComment: boolean;
  addComment: (input: NewProofComment) => Promise<ProofActionResult>;
  resolveComment?: (commentId: string, resolved: boolean) => Promise<ProofActionResult>;
  voiceNotes?: VoiceNoteView[];
  /** Server actions that store a recorded note; their presence turns the voice recorder on. */
  voiceActions?: VoiceNoteActions;
}) {
  const t = useTranslations('proofing');
  const tVoice = useTranslations('media.voiceNote');
  const video = useRef<HTMLVideoElement>(null);
  const [pending, setPending] = useState<ProofAnchor | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [comparing, setComparing] = useState(false);
  const comparable = kind === 'image' && previousVersion !== null;
  const nextNumber = Math.max(0, ...comments.map((comment) => comment.number ?? 0)) + 1;

  const pins: Pin[] = comments.flatMap((comment) => {
    const anchor = comment.anchor;
    if (!anchor || comment.number === null) return [];
    if (anchor.type === 'point')
      return [
        {
          id: comment.id,
          number: comment.number,
          x: anchor.x,
          y: anchor.y,
          resolved: comment.resolved,
        },
      ];
    if (anchor.type === 'page_point' && anchor.page === page) {
      return [
        {
          id: comment.id,
          number: comment.number,
          x: anchor.x,
          y: anchor.y,
          resolved: comment.resolved,
        },
      ];
    }
    return [];
  });
  const pendingPoint =
    pending?.type === 'point' || (pending?.type === 'page_point' && pending.page === page)
      ? { x: pending.x, y: pending.y }
      : null;

  const select = (id: string) => {
    setActiveId(id);
    const anchor = comments.find((comment) => comment.id === id)?.anchor;
    if (anchor?.type === 'page_point') setPage(anchor.page);
    if (anchor?.type === 'time' && video.current) video.current.currentTime = anchor.seconds;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section aria-label={t('viewer.label')} className="flex flex-col gap-3">
        {comparable && comparing ? (
          <ImageCompare
            before={{
              src: `/api/proofs/${previousVersion.id}/file`,
              alt: t('viewer.imageAlt', { title, number: previousVersion.number }),
            }}
            after={{ src, alt: t('viewer.imageAlt', { title, number }) }}
            label={t('viewer.compareLabel', { before: previousVersion.number, after: number })}
          />
        ) : kind === 'image' ? (
          <ImageCanvas
            src={src}
            alt={t('viewer.imageAlt', { title, number })}
            pins={pins}
            pending={pendingPoint}
            activeId={activeId}
            canPin={canComment}
            onPick={(point) => setPending({ type: 'point', ...point })}
            onSelect={select}
          />
        ) : kind === 'pdf' ? (
          <PdfCanvas
            src={src}
            pages={pages ?? 1}
            page={page}
            onPageChange={setPage}
            pins={pins}
            pending={pendingPoint}
            activeId={activeId}
            canPin={canComment}
            onPick={(point) => setPending({ type: 'page_point', page, ...point })}
            onSelect={select}
          />
        ) : (
          <VideoPlayer
            ref={video}
            src={src}
            title={title}
            canPin={canComment}
            onPickTime={(seconds) => setPending({ type: 'time', seconds })}
          />
        )}
        {comparable ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            aria-pressed={comparing}
            onClick={() => setComparing(!comparing)}
          >
            {comparing ? t('viewer.closeCompare') : t('viewer.compare')}
          </Button>
        ) : null}
        {canComment && kind !== 'video' && !comparing ? (
          <p className="text-caption text-text-secondary">{t('viewer.pinHint')}</p>
        ) : null}
      </section>
      <section aria-labelledby="proof-comments" className="flex flex-col gap-4">
        <h2 id="proof-comments" className="text-heading text-text">
          {t('comments.title')}
        </h2>
        {canComment ? (
          <CommentForm
            anchor={anchorLabel(pending, nextNumber)}
            audience={audience}
            onClearAnchor={() => setPending(null)}
            onVoiceNote={
              voiceActions
                ? async (recording, internal) => {
                    const result = await addComment({
                      body: tVoice('body'),
                      anchor: pending,
                      internal,
                    });
                    if (!result.ok || !result.commentId) return false;
                    setPending(null);
                    return sendVoiceNote(
                      voiceActions,
                      { targetKind: 'proof_comment', targetId: result.commentId },
                      recording,
                    );
                  }
                : undefined
            }
            onSubmit={async (body, internal) => {
              const result = await addComment({ body, anchor: pending, internal });
              if (result.ok) setPending(null);
              return result;
            }}
          />
        ) : null}
        <CommentList
          comments={comments}
          voiceNotes={voiceNotes}
          audience={audience}
          activeId={activeId}
          onSelect={select}
          onReply={
            canComment
              ? (parentId, body) => addComment({ body, anchor: null, internal: false, parentId })
              : null
          }
          onResolve={resolveComment ?? null}
        />
      </section>
    </div>
  );
}
