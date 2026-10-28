'use client';

import { useState } from 'react';
import { ArrowRight, Check, FileText, Mail, Video } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button } from '@agency-os/ui/components/button';
import { ClientAvatar } from '@agency-os/ui/components/client-avatar';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import type { PortalMeeting } from '@/modules/agenda';
import type { PortalDocumentCardView } from '@/modules/project-documents';
import type { PortalTeamMember } from '@/modules/team';
import type { ClientProjectView, ClientUpdateView } from '@/modules/rooms';
import type { GettingStartedStep } from './getting-started';
import { startPortalTour } from './portal-tour';

const eyebrow = 'font-mono text-[11px] font-medium tracking-[0.12em] text-text-tertiary uppercase';

function currentPhase(project: ClientProjectView) {
  return (
    project.phases.find(
      (phase) => phase.status === 'in_progress' || phase.status === 'awaiting_approval',
    ) ??
    project.phases.find((phase) => phase.status === 'pending') ??
    null
  );
}

/** The home's lead: where the project stands, what comes next and the way into the details. */
export function ProjectOverview({ project }: { project: ClientProjectView | null }) {
  const t = useTranslations('portal.dashboard.project');
  const format = useFormatter();

  if (!project || project.phases.length === 0) {
    return (
      <section
        aria-labelledby="portal-project"
        data-tour="project"
        className="rd-rise flex flex-col justify-center gap-2 rounded-lg border border-border bg-surface p-6"
      >
        <p className={eyebrow}>{t('eyebrow')}</p>
        <h2 id="portal-project" className="text-title text-text">
          {t('noProjectTitle')}
        </h2>
        <p className="max-w-[56ch] text-body-sm text-text-secondary">{t('noProjectBody')}</p>
      </section>
    );
  }

  const total = project.phases.length;
  const done = project.phases.filter((phase) => phase.status === 'done').length;
  const percent = Math.round((done / total) * 100);
  const current = currentPhase(project);
  const next = current?.steps.find((step) => step.status !== 'done') ?? null;
  const status = !current
    ? { label: t('completed'), tone: 'bg-success-bg text-success' }
    : current.status === 'awaiting_approval'
      ? { label: t('waiting'), tone: 'bg-warning-bg text-warning' }
      : { label: t('inProgress'), tone: 'bg-info-bg text-info' };

  return (
    <section
      aria-labelledby="portal-project"
      data-tour="project"
      className="rd-rise grid gap-6 rounded-lg border border-border bg-surface p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] md:p-6"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <p className={eyebrow}>{t('eyebrow')}</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 id="portal-project" className="text-title text-text">
              {project.name}
            </h2>
            <span
              className={cn('rounded-full px-2.5 py-0.5 text-caption font-medium', status.tone)}
            >
              {status.label}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-baseline gap-3">
            <span className="text-display font-semibold tracking-[-0.02em] text-text tabular-nums">
              {t('percent', { value: percent })}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={t('progress', { done, total })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="flex gap-1"
          >
            {project.phases.map((phase) => (
              <span
                key={phase.id}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  phase.status === 'done'
                    ? 'bg-success'
                    : phase.status === 'pending'
                      ? 'bg-border'
                      : 'bg-brand',
                )}
              />
            ))}
          </div>
          <p className="text-caption text-text-secondary">{t('progress', { done, total })}</p>
        </div>

        {current ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-0.5">
              <dt className="text-caption text-text-tertiary">{t('current')}</dt>
              <dd className="text-body-sm font-medium text-text">{current.name}</dd>
            </div>
            {next ? (
              <div className="flex flex-col gap-0.5">
                <dt className="text-caption text-text-tertiary">{t('next')}</dt>
                <dd className="text-body-sm font-medium text-text">
                  {next.name}
                  {next.dueOn ? (
                    <span className="block text-caption font-normal text-text-secondary">
                      {t('dueOn', {
                        date: format.dateTime(new Date(`${next.dueOn}T12:00:00Z`), {
                          dateStyle: 'medium',
                        }),
                      })}
                    </span>
                  ) : null}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <Button asChild size="sm">
            <Link href="/portal/updates">
              {t('open')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/portal/updates?view=timeline">{t('timeline')}</Link>
          </Button>
        </div>
      </div>

      <ol
        aria-label={t('phases')}
        className="flex flex-col gap-1 border-t border-border pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-5"
      >
        {project.phases.map((phase) => {
          const active = phase.id === current?.id;
          return (
            <li
              key={phase.id}
              aria-current={active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-body-sm',
                active ? 'bg-surface-muted font-medium text-text' : 'text-text-secondary',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px]',
                  phase.status === 'done'
                    ? 'bg-success-bg text-success'
                    : active
                      ? 'bg-brand text-white'
                      : 'border border-border-strong',
                )}
              >
                {phase.status === 'done' ? <Check className="size-3" /> : null}
              </span>
              <span className="truncate">{phase.name}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The client's first steps, until they are all done or the client hides the list. */
export function GettingStarted({
  steps,
  onHide,
}: {
  steps: readonly GettingStartedStep[];
  onHide: () => Promise<void>;
}) {
  const t = useTranslations('portal.dashboard.gettingStarted');
  const [hidden, setHidden] = useState(false);
  const done = steps.filter((step) => step.done).length;
  if (hidden || done === steps.length) return null;

  return (
    <section
      aria-labelledby="portal-getting-started"
      className="rd-rise flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="portal-getting-started" className="text-body font-semibold text-text">
            {t('title')}
          </h2>
          <p className="text-caption text-text-secondary">
            {t('progress', { done, total: steps.length })}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setHidden(true);
            void onHide().catch(() => undefined);
          }}
        >
          {t('hide')}
        </Button>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              'flex items-start gap-3 rounded-md border px-3.5 py-3',
              step.done ? 'border-transparent bg-surface-muted' : 'border-border',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] tabular-nums',
                step.done
                  ? 'bg-success-bg text-success'
                  : 'border border-border-strong text-text-secondary',
              )}
            >
              {step.done ? <Check className="size-3" /> : index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span
                className={cn(
                  'text-body-sm font-medium',
                  step.done ? 'text-text-secondary line-through' : 'text-text',
                )}
              >
                {t(`steps.${step.id}.title`)}
              </span>
              {step.done ? null : (
                <>
                  <span className="text-caption text-text-secondary">
                    {t(`steps.${step.id}.body`)}
                  </span>
                  {step.href ? (
                    <Link
                      href={step.href}
                      className="self-start text-body-sm font-medium text-link hover:underline"
                    >
                      {t('open')}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={startPortalTour}
                      className="self-start text-body-sm font-medium text-link hover:underline"
                    >
                      {t('start')}
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The three latest client-visible updates, as a way back into the project feed. */
export function RecentUpdates({ updates }: { updates: readonly ClientUpdateView[] }) {
  const t = useTranslations('portal.dashboard.updates');
  const tKinds = useTranslations('rooms.updates');
  const format = useFormatter();

  return (
    <section
      aria-labelledby="portal-recent-updates"
      className="rd-rise flex flex-col rounded-lg border border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="portal-recent-updates" className="text-body-sm font-semibold text-text">
          {t('title')}
        </h2>
        <Link href="/portal/updates" className="text-body-sm text-link hover:underline">
          {t('seeAll')}
        </Link>
      </div>
      {updates.length === 0 ? (
        <p className="px-4 py-6 text-body-sm text-text-secondary">{t('empty')}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {updates.slice(0, 3).map((update) => (
            <li key={update.id} className="flex flex-col gap-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 text-caption">
                <span className="font-medium text-text">
                  {update.authorName ?? tKinds('system')}
                </span>
                <time dateTime={update.createdAt} className="text-text-tertiary">
                  {format.dateTime(new Date(update.createdAt), { dateStyle: 'medium' })}
                </time>
              </div>
              <p className="line-clamp-2 text-body-sm text-text-secondary">
                {update.kind === 'manual'
                  ? update.body
                  : tKinds(`kinds.${update.kind}`, { name: update.body })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** The documents most recently shared or updated for the client. */
export function RecentDocuments({ documents }: { documents: readonly PortalDocumentCardView[] }) {
  const t = useTranslations('portal.dashboard.documents');
  const format = useFormatter();
  const recent = [...documents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);

  return (
    <section
      aria-labelledby="portal-recent-documents"
      className="rd-rise flex flex-col rounded-lg border border-border bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 id="portal-recent-documents" className="text-body-sm font-semibold text-text">
          {t('title')}
        </h2>
        <Link href="/portal/docs" className="text-body-sm text-link hover:underline">
          {t('seeAll')}
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-border">
        {recent.map((document) => (
          <li key={document.id}>
            <Link
              href={`/portal/docs/${document.id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors duration-(--duration-fast) hover:bg-surface-muted"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-muted text-text-secondary"
              >
                <FileText className="size-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-body-sm font-medium text-text">
                  {document.title}
                </span>
                <span className="truncate text-caption text-text-tertiary">
                  {t('meta', {
                    project: document.projectName,
                    date: format.dateTime(new Date(document.updatedAt), { dateStyle: 'medium' }),
                  })}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The agency people on the client's account, so the client knows who to talk to. */
export function TeamCard({ team }: { team: readonly PortalTeamMember[] }) {
  const t = useTranslations('portal.dashboard.team');
  if (team.length === 0) return null;

  return (
    <section
      aria-labelledby="portal-team"
      className="rd-rise flex flex-col rounded-lg border border-border bg-surface"
    >
      <h2
        id="portal-team"
        className="border-b border-border px-4 py-3 text-body-sm font-semibold text-text"
      >
        {t('title')}
      </h2>
      <ul className="flex flex-col divide-y divide-border">
        {team.map((member) => (
          <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
            <ClientAvatar id={member.userId} name={member.name} tone="neutral" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-body-sm font-medium text-text">{member.name}</span>
              <span className="text-caption text-text-tertiary">
                {t(`roles.${member.role === 'founder' ? 'founder' : 'project_manager'}`)}
              </span>
            </span>
            <a
              href={`mailto:${member.email}`}
              aria-label={t('email', { name: member.name })}
              className="flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors duration-(--duration-fast) hover:bg-surface-muted hover:text-text"
            >
              <Mail aria-hidden="true" className="size-4" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The next meeting the client is invited to, with the way into the call. */
export function NextMeeting({ meetings }: { meetings: readonly PortalMeeting[] }) {
  const t = useTranslations('portal.dashboard.meeting');
  const format = useFormatter();
  const [next, ...rest] = meetings;

  return (
    <section
      aria-labelledby="portal-meeting"
      className="rd-rise flex flex-col rounded-lg border border-border bg-surface"
    >
      <h2
        id="portal-meeting"
        className="border-b border-border px-4 py-3 text-body-sm font-semibold text-text"
      >
        {t('title')}
      </h2>
      {next ? (
        <div className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="flex w-12 shrink-0 flex-col items-center rounded-md border border-border py-1">
              <span className="text-body font-semibold text-text tabular-nums">
                {format.dateTime(new Date(next.startsAt), { day: 'numeric' })}
              </span>
              <span className="text-[10px] leading-3 text-text-tertiary uppercase">
                {format.dateTime(new Date(next.startsAt), { month: 'short' })}
              </span>
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-body-sm font-medium text-text">{next.title}</span>
              <span className="text-caption text-text-secondary">
                {format.dateTimeRange(new Date(next.startsAt), new Date(next.endsAt), {
                  weekday: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {next.location ? (
                <span className="text-caption text-text-tertiary">{next.location}</span>
              ) : null}
            </span>
          </div>
          {next.meetUrl ? (
            <Button asChild size="sm" className="self-start">
              <a href={next.meetUrl} target="_blank" rel="noreferrer noopener">
                <Video aria-hidden="true" />
                {t('join')}
              </a>
            </Button>
          ) : null}
          {rest.length > 0 ? (
            <p className="text-caption text-text-tertiary">{t('more', { count: rest.length })}</p>
          ) : null}
        </div>
      ) : (
        <p className="px-4 py-6 text-body-sm text-text-secondary">{t('empty')}</p>
      )}
    </section>
  );
}
