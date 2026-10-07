import { notFound } from 'next/navigation';
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { z } from 'zod';
import { Badge } from '@agency-os/ui/components/badge';
import { Button } from '@agency-os/ui/components/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency-os/ui/components/tabs';
import { cn } from '@agency-os/ui/lib/utils';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { canWritePipeline, isPipelineCode, pipelineCodeMessageKey } from '@/modules/commercial';
import { commercialSession, loadDealDetail } from '@/modules/commercial/server';
import { getVerifiedClaims } from '@/platform/session';
import {
  closeFollowUpAction,
  recordOutcomeAction,
  saveContactAction,
  scheduleCallAction,
  updateTrackingAction,
} from './actions';
import {
  ContactForm,
  CopyMessageButton,
  DealMove,
  OutcomeForm,
  ScheduleCallForm,
  TrackingForm,
} from './deal-forms';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; dealId: string }> };

export default async function DealPage({ params }: PageProps) {
  const { locale: requested, dealId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  if (!z.uuid().safeParse(dealId).success) notFound();
  const session = await commercialSession(await getVerifiedClaims());
  if (!session) notFound();
  const detail = await loadDealDetail(session, dealId, locale);
  if (!detail) notFound();

  const t = await getTranslations('commercial');
  const format = await getFormatter();
  const writable = canWritePipeline(session.actor);
  const { deal, client } = detail;
  const codeName = t(`pipeline.codes.${pipelineCodeMessageKey(deal.code)}` as never);
  const scheduledCall = detail.calls.find((call) => call.status === 'scheduled');
  const dateTime = (value: Date) =>
    format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link href="/pipeline" className="text-body-sm text-link hover:underline">
          {t('deal.back')}
        </Link>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-title text-text">{client.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-mono">
                {deal.code}
              </Badge>
              <span className="text-body-sm text-text-secondary">{codeName}</span>
            </div>
          </div>
          {writable ? <DealMove dealId={deal.id} code={deal.code} /> : null}
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs defaultValue="summary" className="min-w-0">
          <TabsList aria-label={t('deal.tabs.label')}>
            <TabsTrigger value="summary">{t('deal.tabs.summary')}</TabsTrigger>
            <TabsTrigger value="application">{t('deal.tabs.application')}</TabsTrigger>
            <TabsTrigger value="calls">{t('deal.tabs.calls')}</TabsTrigger>
            <TabsTrigger value="timeline">{t('deal.tabs.timeline')}</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="flex flex-col gap-6 pt-4">
            <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <h2 className="text-title-sm text-text">{t('deal.tracking.title')}</h2>
              {writable ? (
                <TrackingForm
                  action={updateTrackingAction.bind(null, deal.id)}
                  staff={detail.staff}
                  defaults={{
                    nextStep: deal.nextStep,
                    owner: deal.ownerKind === 'client' ? 'client' : deal.ownerUserId,
                    dueOn: deal.dueOn,
                    value: deal.estimatedValue,
                    currency: deal.currency,
                  }}
                />
              ) : (
                <p className="text-body text-text">{deal.nextStep ?? t('board.card.noNextStep')}</p>
              )}
            </section>

            <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-2">
              {(
                [
                  ['company', client.name],
                  ['website', client.website],
                  ['sector', client.sector],
                  ['revenue', client.revenueBand],
                  ['source', t(`deal.summary.sources.${deal.source}`)],
                  ['lostReason', deal.lostReason],
                ] as const
              )
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <div key={key} className="flex flex-col gap-1">
                    <span className="text-caption text-text-tertiary">
                      {t(`deal.summary.${key}`)}
                    </span>
                    <span className="text-body text-text">{value}</span>
                  </div>
                ))}
            </section>

            <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <h2 className="text-title-sm text-text">{t('deal.contacts.title')}</h2>
              {detail.contacts.length === 0 ? (
                <p className="text-body-sm text-text-secondary">{t('deal.contacts.empty')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {detail.contacts.map((contact) => (
                    <li key={contact.id} className="flex flex-col gap-1 py-3">
                      <span className="text-body text-text">{contact.fullName}</span>
                      <span className="text-caption text-text-secondary">
                        {[
                          t(`deal.contacts.roles.${contact.role}`),
                          contact.jobTitle,
                          contact.email,
                          contact.phone,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {writable ? (
                        <details className="pt-2">
                          <summary className="cursor-pointer text-body-sm text-link">
                            {t('deal.contacts.edit')}
                          </summary>
                          <div className="pt-3">
                            <ContactForm
                              action={saveContactAction.bind(null, deal.id, client.id, contact.id)}
                              defaults={contact}
                              submitLabel={t('deal.contacts.save')}
                            />
                          </div>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {writable ? (
                <details>
                  <summary className="cursor-pointer text-body-sm text-link">
                    {t('deal.contacts.add')}
                  </summary>
                  <div className="pt-3">
                    <ContactForm
                      action={saveContactAction.bind(null, deal.id, client.id, null)}
                      defaults={null}
                      submitLabel={t('deal.contacts.save')}
                    />
                  </div>
                </details>
              ) : null}
            </section>
          </TabsContent>

          <TabsContent value="application" className="flex flex-col gap-4 pt-4">
            {detail.applications.length === 0 ? (
              <p className="text-body text-text-secondary">{t('deal.application.empty')}</p>
            ) : (
              detail.applications.map((application) => (
                <section
                  key={application.id}
                  className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
                    <span>
                      {t('deal.application.submitted', { date: dateTime(application.createdAt) })}
                    </span>
                    <Badge variant="secondary">
                      {t('deal.application.score', { score: application.score })}
                    </Badge>
                    <Badge variant="secondary">
                      {t('deal.application.path', { path: application.path.toUpperCase() })}
                    </Badge>
                    {application.reviewDecision ? (
                      <span>
                        {t('deal.application.reviewed', {
                          path: application.reviewDecision.toUpperCase(),
                        })}
                      </span>
                    ) : null}
                  </div>
                  {application.anonymized ? (
                    <p className="text-body-sm text-text-secondary">
                      {t('deal.application.anonymized')}
                    </p>
                  ) : (
                    <>
                      {application.costOfInaction ? (
                        <blockquote className="rounded-md bg-surface-muted px-4 py-3">
                          <p className="text-caption text-text-tertiary">
                            {t('deal.application.costOfInaction')}
                          </p>
                          <p className="text-body text-text">{application.costOfInaction}</p>
                        </blockquote>
                      ) : null}
                      <dl className="divide-y divide-border">
                        {application.answers.map((item) => (
                          <div
                            key={item.questionId}
                            className="grid gap-1 py-2 md:grid-cols-[1fr_1fr_auto]"
                          >
                            <dt className="text-body-sm text-text-secondary">{item.label}</dt>
                            <dd className="text-body-sm text-text">{item.answer}</dd>
                            <dd
                              className={cn(
                                'text-body-sm tabular-nums md:text-right',
                                item.knockout ? 'text-danger' : 'text-text-tertiary',
                              )}
                            >
                              {item.knockout
                                ? t('deal.application.knockout')
                                : item.points !== null
                                  ? item.points
                                  : null}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  )}
                </section>
              ))
            )}
          </TabsContent>

          <TabsContent value="calls" className="flex flex-col gap-4 pt-4">
            {detail.calls.length === 0 ? (
              <p className="text-body text-text-secondary">{t('deal.calls.empty')}</p>
            ) : (
              detail.calls.map((call) => (
                <section
                  key={call.id}
                  className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body text-text">{dateTime(call.startsAt)}</span>
                    <Badge variant="secondary">{t(`deal.calls.status.${call.status}`)}</Badge>
                  </div>
                  {call.outcome ? (
                    <p className="text-body-sm text-text-secondary">
                      {[t(`deal.calls.outcomes.${call.outcome}`), call.outcomeReason]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                  {call.notes ? <p className="text-body-sm text-text">{call.notes}</p> : null}
                  {call.meetUrl && call.status === 'scheduled' ? (
                    <a
                      href={call.meetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-body-sm text-link hover:underline"
                    >
                      {t('deal.calls.meet')}
                    </a>
                  ) : null}
                  {writable && call.status === 'scheduled' ? (
                    <OutcomeForm action={recordOutcomeAction.bind(null, deal.id, call.id)} />
                  ) : null}
                </section>
              ))
            )}
            {writable &&
            !scheduledCall &&
            isPipelineCode(deal.code) &&
            ['0.2', '0.3', '0.4'].includes(deal.code) ? (
              <ScheduleCallForm action={scheduleCallAction.bind(null, deal.id)} />
            ) : null}
          </TabsContent>

          <TabsContent value="timeline" className="pt-4">
            {detail.timeline.length === 0 ? (
              <p className="text-body text-text-secondary">{t('deal.timeline.empty')}</p>
            ) : (
              <ol className="flex flex-col gap-3 border-l border-border pl-4">
                {detail.timeline.map((entry) => (
                  <li key={entry.id} className="flex flex-col gap-0.5">
                    <span className="text-body-sm text-text">
                      {t(`deal.timeline.kinds.${entry.kind}`)}
                      {entry.kind === 'stage_changed'
                        ? ` · ${t('deal.timeline.stageChange', {
                            from: String(entry.summary.from ?? '—'),
                            to: String(entry.summary.to ?? '—'),
                          })}`
                        : null}
                    </span>
                    <span className="text-caption text-text-tertiary">
                      {[
                        dateTime(entry.createdAt),
                        entry.actorName ? t('deal.timeline.by', { name: entry.actorName }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>

        <aside className="flex flex-col gap-3">
          <h2 className="text-title-sm text-text">{t('deal.followUps.title')}</h2>
          {detail.followUps.length === 0 ? (
            <p className="text-body-sm text-text-secondary">{t('deal.followUps.empty')}</p>
          ) : (
            detail.followUps.map((followUp) => (
              <article
                key={followUp.id}
                className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-2 text-caption text-text-tertiary">
                  <span>{t('deal.followUps.day', { day: followUp.sequenceDay })}</span>
                  <span>
                    {t('deal.followUps.due', {
                      date: format.dateTime(new Date(followUp.dueOn), { dateStyle: 'medium' }),
                    })}
                  </span>
                </div>
                <p className="whitespace-pre-line text-body-sm text-text">
                  {followUp.suggestedMessage}
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopyMessageButton message={followUp.suggestedMessage} />
                  {writable ? (
                    <>
                      <form action={closeFollowUpAction.bind(null, deal.id, followUp.id, 'done')}>
                        <Button type="submit" size="sm">
                          {t('deal.followUps.done')}
                        </Button>
                      </form>
                      <form
                        action={closeFollowUpAction.bind(null, deal.id, followUp.id, 'dismissed')}
                      >
                        <Button type="submit" size="sm" variant="ghost">
                          {t('deal.followUps.dismiss')}
                        </Button>
                      </form>
                    </>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </aside>
      </div>
    </div>
  );
}
