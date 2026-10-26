'use client';

import { useState, useTransition } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Textarea } from '@agency-os/ui/components/textarea';
import { cn } from '@agency-os/ui/lib/utils';
import { VoiceNotePlayer } from '@/components/media/voice-note-player';
import type { ProofCommentView } from '@/modules/proofing';
import type { VoiceNoteView } from '@/modules/voice-notes';
import { anchorLabel } from './anchor-format';
import type { ProofActionResult } from './proof-errors';

function Reply({
  commentId,
  onReply,
}: {
  commentId: string;
  onReply: (parentId: string, body: string) => Promise<ProofActionResult>;
}) {
  const t = useTranslations('proofing.comments');
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t('reply')}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await onReply(commentId, body.trim());
          if (result.ok) {
            setBody('');
            setOpen(false);
          }
        });
      }}
    >
      <Textarea
        aria-label={t('replyBody')}
        rows={2}
        maxLength={2000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        disabled={pending || body.trim() === ''}
        className="self-start"
      >
        {t('sendReply')}
      </Button>
    </form>
  );
}

/** Comments in order with their spot, author and replies; the team resolves and reopens. */
export function CommentList({
  comments,
  audience,
  activeId,
  onSelect,
  onReply,
  onResolve,
  voiceNotes = [],
}: {
  comments: ProofCommentView[];
  voiceNotes?: VoiceNoteView[];
  audience: 'team' | 'client';
  activeId: string | null;
  onSelect: (id: string) => void;
  onReply: ((parentId: string, body: string) => Promise<ProofActionResult>) | null;
  onResolve: ((commentId: string, resolved: boolean) => Promise<ProofActionResult>) | null;
}) {
  const t = useTranslations('proofing.comments');
  const format = useFormatter();

  if (comments.length === 0) {
    return <p className="text-body-sm text-text-secondary">{t('empty')}</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {comments.map((comment) => {
        const label = anchorLabel(comment.anchor, comment.number);
        return (
          <li
            key={comment.id}
            className={cn(
              'flex flex-col gap-2 rounded-md border border-border p-3',
              activeId === comment.id && 'border-primary',
              comment.resolved && 'opacity-70',
            )}
          >
            <button
              type="button"
              className="flex flex-wrap items-center gap-2 text-left"
              onClick={() => onSelect(comment.id)}
            >
              <span className="text-caption font-medium text-text">
                {label.key === 'general'
                  ? t('general')
                  : label.key === 'point'
                    ? t('point', { number: label.number })
                    : label.key === 'pagePoint'
                      ? t('pagePoint', { number: label.number, page: label.page })
                      : t('time', { number: label.number, time: label.time })}
              </span>
              {comment.internal ? <Badge variant="secondary">{t('internalBadge')}</Badge> : null}
              {comment.resolved ? <Badge variant="secondary">{t('resolved')}</Badge> : null}
            </button>
            <p className="text-body-sm whitespace-pre-line text-text">{comment.body}</p>
            {voiceNotes
              .filter((note) => note.targetId === comment.id)
              .map((note) => (
                <VoiceNotePlayer key={note.id} note={note} />
              ))}
            <p className="text-caption text-text-secondary">
              {t('byLine', {
                author: comment.authorName,
                client: comment.byClient && audience === 'team' ? 'yes' : 'no',
                date: format.dateTime(new Date(comment.createdAt), {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </p>
            {comment.replies.length > 0 ? (
              <ul className="flex flex-col gap-2 border-l-2 border-border pl-3">
                {comment.replies.map((reply) => (
                  <li key={reply.id} className="flex flex-col gap-1">
                    <p className="text-body-sm whitespace-pre-line text-text">{reply.body}</p>
                    {voiceNotes
                      .filter((note) => note.targetId === reply.id)
                      .map((note) => (
                        <VoiceNotePlayer key={note.id} note={note} />
                      ))}
                    <p className="text-caption text-text-secondary">{reply.authorName}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {onReply ? <Reply commentId={comment.id} onReply={onReply} /> : null}
              {onResolve ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void onResolve(comment.id, !comment.resolved)}
                >
                  {comment.resolved ? t('reopen') : t('resolve')}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
