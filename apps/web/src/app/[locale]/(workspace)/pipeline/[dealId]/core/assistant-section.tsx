'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import { FormMessage } from '@/components/forms/form-message';
import { applyDraftAction, saveNarrativeAction } from './actions';

function CopyPrompt({ prompt }: { prompt: string }) {
  const t = useTranslations('diagnosis.assistant');
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(prompt);
          setCopied(true);
        }}
      >
        {t('copy')}
      </Button>
      <span aria-live="polite" className="text-body-sm text-text-secondary">
        {copied ? t('copied') : null}
      </span>
    </div>
  );
}

type Feedback = { tone: 'success' | 'danger'; text: string } | null;

export function AssistantSection({
  engagementId,
  dealId,
  prompts,
  narrative,
  blockTitles,
}: {
  engagementId: string;
  dealId: string;
  prompts: { briefing: string | null; narrative: string };
  narrative: string | null;
  blockTitles: Record<string, string>;
}) {
  const t = useTranslations('diagnosis.assistant');
  const [draft, setDraft] = useState('');
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [briefingFeedback, setBriefingFeedback] = useState<Feedback>(null);
  const [narrativeText, setNarrativeText] = useState(narrative ?? '');
  const [narrativeFeedback, setNarrativeFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  const applyDraft = (overwrite: boolean) =>
    startTransition(async () => {
      const result = await applyDraftAction(engagementId, dealId, draft, overwrite);
      if (result.ok) {
        setConflicts(null);
        setDraft('');
        setBriefingFeedback({ tone: 'success', text: t('applied') });
      } else if ('blockIds' in result) {
        setConflicts(result.blockIds);
      } else {
        setBriefingFeedback({ tone: 'danger', text: t(`errors.${result.code}` as never) });
      }
    });

  return (
    <section
      aria-labelledby="core-assistant-title"
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <header className="flex flex-col gap-1">
        <h2 id="core-assistant-title" className="text-title-sm text-text">
          {t('title')}
        </h2>
        <p className="text-body-sm text-text-secondary">{t('description')}</p>
      </header>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-label text-text">{t('briefingTitle')}</h3>
        {prompts.briefing ? (
          <>
            <CopyPrompt prompt={prompts.briefing} />
            <Label htmlFor="assistant-briefing">{t('response')}</Label>
            <Textarea
              id="assistant-briefing"
              rows={6}
              value={draft}
              maxLength={200_000}
              onChange={(event) => setDraft(event.target.value)}
            />
            {conflicts ? (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-2 text-body-sm text-text"
              >
                <span>
                  {t('confirmOverwrite', {
                    blocks: conflicts.map((id) => blockTitles[id] ?? id).join(', '),
                  })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => applyDraft(true)}
                >
                  {t('overwrite')}
                </Button>
              </div>
            ) : null}
            {briefingFeedback ? (
              <FormMessage tone={briefingFeedback.tone}>{briefingFeedback.text}</FormMessage>
            ) : null}
            <div>
              <Button
                type="button"
                disabled={pending || draft.trim() === ''}
                onClick={() => applyDraft(false)}
              >
                {t('applyBriefing')}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-body-sm text-text-tertiary">{t('needsTranscript')}</p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="text-label text-text">{t('narrativeTitle')}</h3>
        <CopyPrompt prompt={prompts.narrative} />
        <Label htmlFor="assistant-narrative">{t('response')}</Label>
        <Textarea
          id="assistant-narrative"
          rows={8}
          value={narrativeText}
          maxLength={20_000}
          onChange={(event) => setNarrativeText(event.target.value)}
        />
        {narrativeFeedback ? (
          <FormMessage tone={narrativeFeedback.tone}>{narrativeFeedback.text}</FormMessage>
        ) : null}
        <div>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await saveNarrativeAction(engagementId, dealId, narrativeText);
                setNarrativeFeedback(
                  result.ok
                    ? { tone: 'success', text: t('applied') }
                    : { tone: 'danger', text: t(`errors.${result.code}` as never) },
                );
              })
            }
          >
            {t('applyNarrative')}
          </Button>
        </div>
      </div>
    </section>
  );
}
