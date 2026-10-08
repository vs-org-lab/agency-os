'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { Textarea } from '@agency-os/ui/components/textarea';
import type { CoreLevel, OrbitFront, RoadmapLane } from '@agency-os/db';
import { Button } from '@agency-os/ui/components/button';
import { FormMessage } from '@/components/forms/form-message';
import { ORBIT_FRONTS, proposeLane } from '@/modules/diagnosis';

const MAX_EVIDENCE_BYTES = 4_194_304;
const EVIDENCE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);

export type FindingFormState = { status: 'idle' | 'saved' } | { status: 'error'; code: string };

export type FindingDefaults = {
  id: string;
  front: OrbitFront;
  title: string;
  description: string;
  evidenceKind: 'file' | 'link' | 'number' | 'page' | null;
  evidenceValue: string | null;
  evidenceNote: string | null;
  impact: CoreLevel;
  effort: CoreLevel;
  lane: RoadmapLane;
  owner: 'internal' | 'aurion';
  bringToCall: boolean;
};

const LEVELS: readonly CoreLevel[] = ['low', 'medium', 'high'];
const LANES: readonly RoadmapLane[] = ['days_30', 'days_90', 'months_12'];
const EVIDENCE_KINDS = ['none', 'file', 'link', 'number', 'page'] as const;
const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';

export function FindingForm({
  action,
  defaults,
  front: initialFront,
  onSaved,
}: {
  action: (state: FindingFormState, formData: FormData) => Promise<FindingFormState>;
  defaults?: FindingDefaults;
  front?: OrbitFront;
  onSaved?: () => void;
}) {
  const t = useTranslations('diagnosis');
  const [state, setState] = useState<FindingFormState>({ status: 'idle' });
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const [impact, setImpact] = useState<CoreLevel>(defaults?.impact ?? 'medium');
  const [effort, setEffort] = useState<CoreLevel>(defaults?.effort ?? 'medium');
  const [lane, setLane] = useState<RoadmapLane>(
    defaults?.lane ?? proposeLane(defaults?.impact ?? 'medium', defaults?.effort ?? 'medium'),
  );
  const [laneChosen, setLaneChosen] = useState(defaults !== undefined);
  const [evidenceKind, setEvidenceKind] = useState<(typeof EVIDENCE_KINDS)[number]>(
    defaults ? (defaults.evidenceKind ?? 'none') : 'file',
  );
  const prefix = defaults?.id ?? 'new';

  useEffect(() => {
    if (state.status === 'saved') onSaved?.();
  }, [state, onSaved]);

  const updateLevels = (next: { impact?: CoreLevel; effort?: CoreLevel }) => {
    const nextImpact = next.impact ?? impact;
    const nextEffort = next.effort ?? effort;
    setImpact(nextImpact);
    setEffort(nextEffort);
    if (!laneChosen) setLane(proposeLane(nextImpact, nextEffort));
  };

  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const file = fileInput.current?.files?.[0];
        if (evidenceKind === 'file' && file && file.size > 0) {
          if (file.size > MAX_EVIDENCE_BYTES) {
            setState({ status: 'error', code: 'file_too_large' });
            return;
          }
          if (file.type && !EVIDENCE_TYPES.has(file.type)) {
            setState({ status: 'error', code: 'file_type' });
            return;
          }
        }
        startTransition(async () => {
          setState(
            await action(state, formData).catch(
              () => ({ status: 'error', code: 'not_found' }) as const,
            ),
          );
        });
      }}
    >
      {defaults ? <input type="hidden" name="findingId" value={defaults.id} /> : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-front`}>{t('findings.front')}</Label>
        <select
          id={`${prefix}-front`}
          name="front"
          defaultValue={defaults?.front ?? initialFront ?? 'core'}
          className={FIELD}
        >
          {ORBIT_FRONTS.map((front) => (
            <option key={front} value={front}>
              {t(`fronts.${front}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-title`}>{t('findings.name')}</Label>
        <Input
          id={`${prefix}-title`}
          name="title"
          required
          maxLength={200}
          defaultValue={defaults?.title ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <Label htmlFor={`${prefix}-description`}>{t('findings.details')}</Label>
        <Textarea
          id={`${prefix}-description`}
          name="description"
          rows={3}
          maxLength={5000}
          defaultValue={defaults?.description ?? ''}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-evidence-kind`}>{t('findings.evidenceKind')}</Label>
        <select
          id={`${prefix}-evidence-kind`}
          name="evidenceKind"
          value={evidenceKind}
          onChange={(event) =>
            setEvidenceKind(event.target.value as (typeof EVIDENCE_KINDS)[number])
          }
          className={FIELD}
        >
          {EVIDENCE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {t(`findings.evidenceKinds.${kind}`)}
            </option>
          ))}
        </select>
      </div>
      {evidenceKind === 'file' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-evidence-file`}>{t('findings.evidenceFile')}</Label>
          <Input
            id={`${prefix}-evidence-file`}
            ref={fileInput}
            name="evidenceFile"
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            required={defaults?.evidenceKind !== 'file'}
          />
        </div>
      ) : evidenceKind !== 'none' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefix}-evidence-value`}>{t('findings.evidenceValue')}</Label>
          <Input
            id={`${prefix}-evidence-value`}
            name="evidenceValue"
            required
            type={evidenceKind === 'link' ? 'url' : 'text'}
            maxLength={2000}
            defaultValue={defaults?.evidenceValue ?? ''}
          />
        </div>
      ) : (
        <div />
      )}
      {evidenceKind !== 'none' ? (
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor={`${prefix}-evidence-note`}>{t('findings.evidenceNote')}</Label>
          <Input
            id={`${prefix}-evidence-note`}
            name="evidenceNote"
            maxLength={500}
            defaultValue={defaults?.evidenceNote ?? ''}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-impact`}>{t('findings.impact')}</Label>
        <select
          id={`${prefix}-impact`}
          name="impact"
          value={impact}
          onChange={(event) => updateLevels({ impact: event.target.value as CoreLevel })}
          className={FIELD}
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`levels.${level}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-effort`}>{t('findings.effort')}</Label>
        <select
          id={`${prefix}-effort`}
          name="effort"
          value={effort}
          onChange={(event) => updateLevels({ effort: event.target.value as CoreLevel })}
          className={FIELD}
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`levels.${level}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-lane`}>{t('findings.lane')}</Label>
        <select
          id={`${prefix}-lane`}
          name="lane"
          value={lane}
          aria-describedby={`${prefix}-lane-hint`}
          onChange={(event) => {
            setLane(event.target.value as RoadmapLane);
            setLaneChosen(true);
          }}
          className={FIELD}
        >
          {LANES.map((option) => (
            <option key={option} value={option}>
              {t(`lanes.${option}`)}
            </option>
          ))}
        </select>
        <p id={`${prefix}-lane-hint`} className="text-caption text-text-tertiary">
          {t('findings.laneHint')}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${prefix}-owner`}>{t('findings.owner')}</Label>
        <select
          id={`${prefix}-owner`}
          name="owner"
          defaultValue={defaults?.owner ?? 'aurion'}
          className={FIELD}
        >
          <option value="internal">{t('owners.internal')}</option>
          <option value="aurion">{t('owners.aurion')}</option>
        </select>
      </div>
      <label className="flex items-start gap-2 text-body text-text md:col-span-2">
        <input
          type="checkbox"
          name="bringToCall"
          defaultChecked={defaults?.bringToCall ?? false}
          className="mt-1 size-4"
          aria-describedby={`${prefix}-call-hint`}
        />
        <span className="flex flex-col">
          {t('findings.bringToCall')}
          <span id={`${prefix}-call-hint`} className="text-caption text-text-tertiary">
            {t('findings.bringToCallHint')}
          </span>
        </span>
      </label>
      {state.status === 'error' ? (
        <div className="md:col-span-2">
          <FormMessage tone="danger">{t(`findings.errors.${state.code}` as never)}</FormMessage>
        </div>
      ) : null}
      <div className="md:col-span-2 md:w-56">
        <Button type="submit" disabled={pending} className="w-full">
          {t('findings.save')}
        </Button>
      </div>
    </form>
  );
}
