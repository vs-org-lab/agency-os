'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { Input } from '@agency-os/ui/components/input';
import { Label } from '@agency-os/ui/components/label';
import { FormMessage } from '@/components/forms/form-message';
import { PIPELINE_STAGES, pipelineCodeMessageKey, type PipelineCode } from '@/modules/commercial';
import {
  MAX_PHASES,
  MAX_STEPS_PER_PHASE,
  validateProcessDefinition,
  type ProcessDefinition,
  type ProcessPhaseDefinition,
} from '@/modules/rooms';

export type PublishProcessInput = {
  key?: string;
  name: string;
  definition: ProcessDefinition;
  makeDefault: boolean;
};

export type PublishProcess = (
  input: PublishProcessInput,
) => Promise<{ ok: true; key: string; version: number } | { ok: false; rule: string }>;

export type EditableProcessTemplate = {
  key: string | null;
  name: string;
  version: number;
  isDefault: boolean;
  definition: ProcessDefinition;
};

const FIELD = 'h-11 rounded-md border border-border bg-surface px-3 text-body text-text md:h-9';

const ORBIT_CODES: readonly PipelineCode[] =
  PIPELINE_STAGES.find((entry) => entry.stage === 'orbit')?.codes ?? [];

const EMPTY_PHASE: ProcessPhaseDefinition = {
  name: '',
  requiresApproval: false,
  codeOnStart: null,
  codeOnDone: null,
  steps: [{ name: '', visibleToClient: false, chained: false }],
};

/** Edits a process template's phases and steps and publishes them as a new version. */
export function ProcessTemplateEditor({
  template,
  publish,
}: {
  template: EditableProcessTemplate;
  publish: PublishProcess;
}) {
  const t = useTranslations();
  const tp = useTranslations('settings.processTemplates');
  const [name, setName] = useState(template.name);
  const [makeDefault, setMakeDefault] = useState(template.isDefault);
  const [phases, setPhases] = useState<ProcessPhaseDefinition[]>(template.definition.phases);
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const idPrefix = `process-${template.key ?? 'new'}`;

  const updatePhase = (
    index: number,
    change: (phase: ProcessPhaseDefinition) => ProcessPhaseDefinition,
  ) => {
    setPhases((current) =>
      current.map((phase, position) => (position === index ? change(phase) : phase)),
    );
    setMessage(null);
  };

  const codeOption = (code: PipelineCode) => (
    <option key={code} value={code}>
      {tp('codeOption', {
        code,
        name: t(`commercial.pipeline.codes.${pipelineCodeMessageKey(code)}` as never),
      })}
    </option>
  );

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const definition = { phases };
        if (!validateProcessDefinition(definition).ok || name.trim() === '') {
          setMessage({ tone: 'danger', text: tp('invalid') });
          return;
        }
        startTransition(async () => {
          const result = await publish({
            ...(template.key ? { key: template.key } : {}),
            name,
            definition,
            makeDefault,
          }).catch(() => ({ ok: false, rule: 'not_found' }) as const);
          setMessage(
            result.ok
              ? { tone: 'success', text: tp('published', { version: result.version }) }
              : { tone: 'danger', text: tp('invalid') },
          );
        });
      }}
    >
      {template.version > 0 ? (
        <p className="text-body-sm text-text-secondary">
          {tp('version', { version: template.version })}
        </p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${idPrefix}-name`}>{tp('templateName')}</Label>
          <Input
            id={`${idPrefix}-name`}
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
              setMessage(null);
            }}
          />
        </div>
        <div className="flex items-center gap-2 md:pt-6">
          <input
            id={`${idPrefix}-default`}
            type="checkbox"
            className="size-4"
            checked={makeDefault}
            onChange={(event) => setMakeDefault(event.target.checked)}
          />
          <Label htmlFor={`${idPrefix}-default`} className="text-body-sm text-text">
            {tp('isDefault')}
          </Label>
        </div>
      </div>

      {phases.map((phase, phaseIndex) => {
        const phaseId = `${idPrefix}-phase-${phaseIndex}`;
        return (
          <fieldset
            key={phaseId}
            className="flex flex-col gap-3 rounded-md border border-border p-3"
          >
            <legend className="px-1 text-label text-text">
              {tp('phase', { number: phaseIndex + 1 })}
            </legend>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1 md:col-span-2">
                <Label htmlFor={`${phaseId}-name`}>{tp('phaseName')}</Label>
                <Input
                  id={`${phaseId}-name`}
                  value={phase.name}
                  maxLength={120}
                  onChange={(event) => {
                    const value = event.target.value;
                    updatePhase(phaseIndex, (current) => ({ ...current, name: value }));
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${phaseId}-start`}>{tp('codeOnStart')}</Label>
                <select
                  id={`${phaseId}-start`}
                  className={FIELD}
                  value={phase.codeOnStart ?? ''}
                  onChange={(event) => {
                    const value = (event.target.value || null) as PipelineCode | null;
                    updatePhase(phaseIndex, (current) => ({ ...current, codeOnStart: value }));
                  }}
                >
                  <option value="">{tp('noCode')}</option>
                  {ORBIT_CODES.map(codeOption)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${phaseId}-done`}>{tp('codeOnDone')}</Label>
                <select
                  id={`${phaseId}-done`}
                  className={FIELD}
                  value={phase.codeOnDone ?? ''}
                  onChange={(event) => {
                    const value = (event.target.value || null) as PipelineCode | null;
                    updatePhase(phaseIndex, (current) => ({ ...current, codeOnDone: value }));
                  }}
                >
                  <option value="">{tp('noCode')}</option>
                  {ORBIT_CODES.map(codeOption)}
                </select>
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  id={`${phaseId}-approval`}
                  type="checkbox"
                  className="size-4"
                  checked={phase.requiresApproval}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    updatePhase(phaseIndex, (current) => ({
                      ...current,
                      requiresApproval: checked,
                    }));
                  }}
                />
                <Label htmlFor={`${phaseId}-approval`} className="text-body-sm text-text">
                  {tp('requiresApproval')}
                </Label>
              </div>
            </div>

            <ol className="flex flex-col gap-2">
              {phase.steps.map((step, stepIndex) => {
                const stepId = `${phaseId}-step-${stepIndex}`;
                const updateStep = (change: Partial<typeof step>) =>
                  updatePhase(phaseIndex, (current) => ({
                    ...current,
                    steps: current.steps.map((entry, position) =>
                      position === stepIndex ? { ...entry, ...change } : entry,
                    ),
                  }));
                return (
                  <li
                    key={stepId}
                    className="flex flex-col gap-2 rounded-md bg-surface-muted p-2 md:flex-row md:items-end"
                  >
                    <div className="flex flex-1 flex-col gap-1">
                      <Label htmlFor={`${stepId}-name`}>{tp('stepName')}</Label>
                      <Input
                        id={`${stepId}-name`}
                        value={step.name}
                        maxLength={120}
                        onChange={(event) => updateStep({ name: event.target.value })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${stepId}-visible`}
                        type="checkbox"
                        className="size-4"
                        checked={step.visibleToClient}
                        onChange={(event) => updateStep({ visibleToClient: event.target.checked })}
                      />
                      <Label htmlFor={`${stepId}-visible`} className="text-body-sm text-text">
                        {tp('visibleToClient')}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${stepId}-chained`}
                        type="checkbox"
                        className="size-4"
                        checked={stepIndex > 0 && step.chained}
                        disabled={stepIndex === 0}
                        onChange={(event) => updateStep({ chained: event.target.checked })}
                      />
                      <Label htmlFor={`${stepId}-chained`} className="text-body-sm text-text">
                        {tp('chained')}
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={phase.steps.length === 1}
                      onClick={() =>
                        updatePhase(phaseIndex, (current) => ({
                          ...current,
                          steps: current.steps
                            .filter((_, position) => position !== stepIndex)
                            .map((entry, position) =>
                              position === 0 ? { ...entry, chained: false } : entry,
                            ),
                        }))
                      }
                    >
                      {tp('removeStep')}
                    </Button>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={phase.steps.length >= MAX_STEPS_PER_PHASE}
                onClick={() =>
                  updatePhase(phaseIndex, (current) => ({
                    ...current,
                    steps: [...current.steps, { name: '', visibleToClient: false, chained: false }],
                  }))
                }
              >
                {tp('addStep')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={phases.length === 1}
                onClick={() => {
                  setPhases((current) => current.filter((_, position) => position !== phaseIndex));
                  setMessage(null);
                }}
              >
                {tp('removePhase')}
              </Button>
            </div>
          </fieldset>
        );
      })}

      <div>
        <Button
          type="button"
          variant="outline"
          disabled={phases.length >= MAX_PHASES}
          onClick={() => {
            setPhases((current) => [...current, EMPTY_PHASE]);
            setMessage(null);
          }}
        >
          {tp('addPhase')}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {message ? <FormMessage tone={message.tone}>{message.text}</FormMessage> : null}
        <div className="md:w-56">
          <Button type="submit" disabled={pending} className="w-full">
            {tp('publish')}
          </Button>
        </div>
      </div>
    </form>
  );
}
