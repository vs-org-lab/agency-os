import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@agency-os/ui/components/tabs';
import { HealthCard } from '@/components/health/health-card';
import { requireArea } from '@/components/shell/session-guard';
import { requireLocale } from '@/i18n/require-locale';
import { loadRoomHealth } from '@/modules/health/server';
import { loadProjectProofs, loadProjectRounds } from '@/modules/proofing/server';
import { loadProcessTemplates, loadStaffRoom } from '@/modules/rooms/server';
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
import { NewProjectForm } from './room/new-project-form';
import { PlanView } from './room/plan-view';
import { ProcessBoard } from './room/process-board';
import { ProjectCard } from './room/project-card';
import { ProofsSection } from './room/proofs-section';
import { RoomHeader } from './room/room-header';

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
  const data = await loadStaffRoom(session, { clientId, projectId });
  if (!data) notFound();
  const { room, writable, editable } = data;
  const health = await loadRoomHealth(session.claims, clientId);
  const templates = writable
    ? await loadProcessTemplates({
        claims: session.claims,
        organizationId: session.actor.organizationId,
      })
    : [];
  const t = await getTranslations('rooms');
  const tp = await getTranslations('proofing.section');
  const [proofs, rounds] = room.project
    ? await Promise.all([
        loadProjectProofs(session.claims, clientId, room.project.id),
        loadProjectRounds(session.claims, room.project.id),
      ])
    : [null, null];

  return (
    <div className="flex flex-col gap-6">
      <RoomHeader
        clientId={clientId}
        clientName={room.clientName}
        projects={room.projects}
        selectedId={room.project?.id ?? null}
        basePath={`/c/${clientId}`}
      />
      {health ? <HealthCard health={health} /> : null}

      {room.project ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <Tabs defaultValue="steps">
            <TabsList>
              <TabsTrigger value="steps">{t('tabs.steps')}</TabsTrigger>
              <TabsTrigger value="plan">{t('tabs.plan')}</TabsTrigger>
              <TabsTrigger value="proofs">{tp('title')}</TabsTrigger>
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
          </Tabs>
          <ProjectCard project={room.project} team={room.team} />
        </div>
      ) : (
        <EmptyState title={t('noProject')} description={t('noProjectHint')} />
      )}

      {writable && templates.length > 0 ? (
        <details className="rounded-lg border border-border bg-surface p-4">
          <summary className="cursor-pointer text-label text-text">{t('newProject')}</summary>
          <div className="pt-4">
            <NewProjectForm
              clientId={clientId}
              templates={templates.map((template) => ({ key: template.key, name: template.name }))}
              create={createProjectAction}
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
