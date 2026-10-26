'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Textarea } from '@agency-os/ui/components/textarea';
import { Trash2 } from 'lucide-react';
import type { TaskDetail } from '@/modules/tasks';
import type { TaskActionResult } from './task-errors';
import { useTaskAction } from './use-task-action';

const MAX_COMMENT_LENGTH = 5000;

/** Comments in order, as plain text, with a field that sends on Ctrl or Cmd plus Enter. */
export function TaskComments({
  taskId,
  comments,
  addComment,
  deleteComment,
}: {
  taskId: string;
  comments: TaskDetail['comments'];
  addComment: (taskId: string, body: string) => Promise<TaskActionResult>;
  deleteComment: (commentId: string) => Promise<TaskActionResult>;
}) {
  const t = useTranslations('tasks.panel.comments');
  const format = useFormatter();
  const { run, pending } = useTaskAction();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  // State updates are asynchronous: the ref stops a second keystroke from sending twice.
  const inFlight = useRef(false);

  const send = async () => {
    const value = body.trim();
    if (!value || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    const saved = await run(() => addComment(taskId, value));
    inFlight.current = false;
    setSending(false);
    if (saved) setBody('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === 'Enter' &&
      (event.ctrlKey || event.metaKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send();
    }
  };

  return (
    <section aria-labelledby="task-comments-heading" className="flex flex-col gap-3">
      <h3 id="task-comments-heading" className="text-label text-text">
        {t('heading')}
      </h3>
      {comments.length === 0 ? (
        <p className="text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((comment) => {
            const author = comment.authorName ?? t('unknownAuthor');
            return (
              <li key={comment.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-caption text-text-secondary">
                  <span className="font-medium text-text">{author}</span>
                  <time dateTime={comment.createdAt}>
                    {format.dateTime(new Date(comment.createdAt), {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  {comment.canDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto"
                      disabled={pending}
                      aria-label={t('delete', { author })}
                      onClick={() => void run(() => deleteComment(comment.id))}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  ) : null}
                </div>
                <p className="text-body-sm whitespace-pre-wrap text-text">{comment.body}</p>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label={t('placeholder')}
          placeholder={t('placeholder')}
          aria-describedby="task-comment-hint"
          rows={3}
          maxLength={MAX_COMMENT_LENGTH}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="flex items-center justify-between gap-3">
          <span id="task-comment-hint" className="text-caption text-text-secondary">
            {t('hint')}
          </span>
          <Button type="button" size="sm" disabled={sending || body.trim() === ''} onClick={send}>
            {t('send')}
          </Button>
        </div>
      </div>
    </section>
  );
}
