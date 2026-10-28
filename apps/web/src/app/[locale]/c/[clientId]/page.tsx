import { notFound } from 'next/navigation';
import { OnboardingProgress } from '@/components/client-onboarding/onboarding-progress';
import { loadOnboarding } from '@/modules/client-onboarding/server';
import { reopenOnboardingAction } from '../../onboarding-actions';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency-os/ui/components/tabs';
import { HealthCard } from '@/components/health/health-card';
import { hasHealthData } from '@/components/health/has-health-data';
import { offersClientPreview } from '@/components/shell/portal-preview-path';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadRoomHealth } from '@/modules/health/server';
import { loadProjectProofs, loadProjectRounds } from '@/modules/proofing/server';
import { phaseTimeline } from '@/modules/rooms';
import { loadProcessTemplates, loadStaffRoom } from '@/modules/rooms/server';
import { loadRoomResults } from '@/modules/results/server';
import { loadProjectTestimonial } from '@/modules/testimonials/server';
import { ResultsStrip } from '@/components/results/results-strip';
import {
  completePhaseAction,
  createProjectAction,
  requestApprovalAction,
  requestFinalApprovalAction,
  setStepStatusAction,
  startPhaseAction,
  updatePhaseAction,
  updateStepAction,
  withdrawApprovalAction,
} from './actions';
import {
  finishProofUploadAction,
  requestProofApprovalAction,
  saveRevisionLimitAction,
  startProofAction,
  startProofVersionAction,
  withdrawProofApprovalAction,
} from './proof-actions';
import { FinalApprovalCard } from './room/final-approval';
import { NewProjectSheet } from './room/new-project-form';
import { PlanView } from './room/plan-view';
import { ProcessBoard } from './room/process-board';
import { ProjectCard } from './room/project-card';
import { ProofsSection } from './room/proofs-section';
import { RoomHeader } from './room/room-header';
import { TimelineView } from '@/components/rooms/timeline-view';
import { TestimonialSection } from './room/testimonial-section';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ locale: string; clientId: string }>;
  searchParams: Promise<{ project?: string }>;
};

export default async function RoomDashboardPage({ params, searchParams }: PageProps) {
  const { locale: requested, clientId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const { project: projectId } = await searchParams;
  const [data, health, results, onboarding] = await Promise.all([
    loadStaffRoom(session, { clientId, projectId }),
    loadRoomHealth(session.claims, clientId),
    loadRoomResults(session.claims, clientId),
    loadOnboarding(session.claims, clientId),
  ]);
  if (!data) notFound();
  const { room, writable, editable } = data;
  const [templates, [proofs, rounds, testimonial]] = await Promise.all([
    writable
      ? loadProcessTemplates({
          claims: session.claims,
          organizationId: session.actor.organizationId,
        })
      : [],
    room.project
      ? Promise.all([
          loadProjectProofs(session.claims, clientId, room.project.id),
          loadProjectRounds(session.claims, room.project.id),
          loadProjectTestimonial(session.claims, room.project.id),
        ])
      : ([null, null, null] as const),
  ]);
  const t = await getTranslations('rooms');
  const timeline = room.project ? phaseTimeline(room.project.phases, room.project.startsOn) : null;
  const tp = await getTranslations('proofing.section');
  const tt = await getTranslations('testimonials.team');

  return (
    <div className="flex flex-col gap-6">
      <RoomHeader
        title={room.clientName}
        client={{ id: clientId, name: room.clientName }}
        projects={room.projects}
        selectedId={room.project?.id ?? null}
        showPreviewLink={offersClientPreview(session.actor)}
        basePath={`/c/${clientId}`}
        actions={
          writable && templates.length > 0 ? (
            <NewProjectSheet
              clientId={clientId}
              templates={templates.map((template) => ({ key: template.key, name: template.name }))}
              create={createProjectAction}
            />
          ) : null
        }
      />

      {results ? (
        <ResultsStrip
          kpis={results.kpis}
          currentMonth={results.currentMonth}
          href={`/c/${clientId}/results`}
          emptyHref={writable ? `/c/${clientId}/results` : undefined}
        />
      ) : null}

      {onboarding ? (
        <OnboardingProgress
          view={onboarding}
          reopen={writable ? reopenOnboardingAction.bind(null, clientId) : null}
        />
      ) : null}

      {room.project ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Tabs defaultValue="steps">
            <TabsList>
              <TabsTrigger value="steps">{t('tabs.steps')}</TabsTrigger>
              <TabsTrigger value="plan">{t('tabs.plan')}</TabsTrigger>
              <TabsTrigger value="timeline">{t('tabs.timeline')}</TabsTrigger>
              <TabsTrigger value="proofs">{tp('title')}</TabsTrigger>
              <TabsTrigger value="testimonial">{tt('title')}</TabsTrigger>
            </TabsList>
            <TabsContent value="steps" className="pt-4">
              <ProcessBoard
                project={room.project}
                people={room.people}
                writable={writable}
                editable={editable}
                currentUserId={session.claims.sub}
                actions={{
                  startPhase: startPhaseAction,
                  completePhase: completePhaseAction,
                  requestApproval: requestApprovalAction,
                  withdrawApproval: withdrawApprovalAction,
                  updatePhase: updatePhaseAction,
                  setStepStatus: setStepStatusAction,
                  updateStep: updateStepAction,
                }}
              />
              <div className="pt-4">
                <FinalApprovalCard
                  project={room.project}
                  writable={writable}
                  request={requestFinalApprovalAction}
                  withdraw={withdrawApprovalAction}
                />
              </div>
            </TabsContent>
            <TabsContent value="plan" className="pt-4">
              <PlanView phases={room.project.phases} startsOn={room.project.startsOn} />
            </TabsContent>
            <TabsContent value="timeline" className="pt-4">
              <TimelineView
                rows={timeline?.rows ?? []}
                undated={(timeline?.undated ?? []).map(
                  (id) => room.project?.phases.find((phase) => phase.id === id)?.name ?? id,
                )}
                today={new Date().toISOString().slice(0, 10)}
              />
            </TabsContent>
            <TabsContent value="proofs" className="pt-4">
              <ProofsSection
                clientId={clientId}
                projectId={room.project.id}
                files={proofs ?? []}
                rounds={rounds ?? { used: 0, limit: 3, warning: false, extra: false }}
                writable={writable}
                actions={{
                  start: startProofAction,
                  newVersion: startProofVersionAction,
                  finish: finishProofUploadAction,
                  request: requestProofApprovalAction,
                  withdraw: withdrawProofApprovalAction,
                  saveLimit: saveRevisionLimitAction,
                }}
              />
            </TabsContent>
            <TabsContent value="testimonial" className="pt-4">
              <TestimonialSection testimonial={testimonial} />
            </TabsContent>
          </Tabs>
          <ProjectCard project={room.project} team={room.team} health={health} />
        </div>
      ) : (
        <EmptyState title={t('noProject')} description={t('noProjectHint')} />
      )}
      {health && hasHealthData(health) ? <HealthCard health={health} /> : null}
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'shell.room.dashboard');
}
