import { getTranslations } from 'next-intl/server';
import type { Locale } from '@agency-os/i18n';
import { stageOneGaps, type CoreReadiness, type ReadinessGap } from '@/modules/diagnosis';
import { loadCorePrompts, type CoreWorkspace } from '@/modules/diagnosis/server';
import { isFounderActor } from '@/modules/commercial';
import type { CommercialSession } from '@/modules/commercial/server';
import { loadProposalWorkspace } from '@/modules/contracts/server';
import { AssistantSection } from './assistant-section';
import { BriefingSection } from './briefing-section';
import { FindingsSection } from './findings-section';
import { OrbitSection } from './orbit-section';
import { PortalAccess } from './portal-access';
import { saveProposalAction, sendProposalAction, withdrawProposalAction } from './contract-actions';
import { PresentationSection } from './presentation-section';
import { ProposalSection } from './proposal-section';
import { CrossReviewSection, RoadmapSection } from './review-section';

const STAGE_ONE_TARGETS = ['1.3', '1.4', '1.5', '1.6'] as const;

function allGaps(readiness: CoreReadiness): ReadinessGap[] {
  return [...new Set(STAGE_ONE_TARGETS.flatMap((code) => stageOneGaps(code, readiness)))];
}

async function ReadinessPanel({ readiness }: { readiness: CoreReadiness }) {
  const t = await getTranslations();
  const gaps = allGaps(readiness);
  return (
    <section
      aria-labelledby="core-readiness-title"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4"
    >
      <h2 id="core-readiness-title" className="text-title-sm text-text">
        {t('diagnosis.readiness.title')}
      </h2>
      {gaps.length === 0 ? (
        <p className="text-body-sm text-success">{t('diagnosis.readiness.ready')}</p>
      ) : (
        <>
          <p className="text-body-sm text-text-secondary">{t('diagnosis.readiness.missing')}</p>
          <ul className="list-disc pl-5 text-body-sm text-text">
            {gaps.map((gap) => (
              <li key={gap}>{t(`commercial.pipeline.gaps.${gap}`)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export async function CoreTab({
  session,
  workspace,
  writable,
  locale,
}: {
  session: CommercialSession;
  workspace: CoreWorkspace;
  writable: boolean;
  locale: Locale;
}) {
  const clientNumbers = workspace.briefing.notes
    .map((note) => note.body.trim())
    .filter((body) => body !== '')
    .join('\n');
  const [prompts, proposal] = await Promise.all([
    loadCorePrompts(session, workspace, locale, clientNumbers),
    loadProposalWorkspace(session, workspace.dealId),
  ]);
  const blockTitles = Object.fromEntries(
    workspace.briefing.guide.blocks.map((block) => [block.id, block.title[locale]]),
  );

  return (
    <div className="flex flex-col gap-6">
      <ReadinessPanel readiness={workspace.readiness} />
      {writable ? (
        <PortalAccess dealId={workspace.dealId} granted={workspace.portalAccess} />
      ) : null}
      <BriefingSection
        engagementId={workspace.engagementId}
        dealId={workspace.dealId}
        guide={workspace.briefing.guide}
        notes={workspace.briefing.notes}
        transcript={workspace.briefing.transcript}
        sharedAt={workspace.briefing.sharedAt}
        buyerTestUrl={workspace.buyerTestUrl}
        latestRecording={workspace.latestRecording}
        writable={writable}
        locale={locale}
      />
      <FindingsSection
        engagementId={workspace.engagementId}
        dealId={workspace.dealId}
        findings={workspace.findings}
        writable={writable}
      />
      <OrbitSection
        engagementId={workspace.engagementId}
        dealId={workspace.dealId}
        grid={workspace.grid}
        scores={workspace.scores}
        index={workspace.index}
        writable={writable}
        locale={locale}
      />
      <RoadmapSection roadmap={workspace.roadmap} internalItems={workspace.internalItems} />
      <CrossReviewSection
        engagementId={workspace.engagementId}
        dealId={workspace.dealId}
        review={workspace.crossReview}
        writable={writable}
      />
      <PresentationSection
        dealId={workspace.dealId}
        documents={workspace.documents}
        writable={writable}
      />
      {proposal && writable ? (
        <ProposalSection
          workspace={proposal}
          founder={isFounderActor(session.actor)}
          actions={{
            save: saveProposalAction,
            send: sendProposalAction,
            withdraw: withdrawProposalAction,
          }}
        />
      ) : null}
      {writable ? (
        <AssistantSection
          engagementId={workspace.engagementId}
          dealId={workspace.dealId}
          prompts={prompts}
          narrative={workspace.narrative}
          blockTitles={blockTitles}
        />
      ) : null}
    </div>
  );
}
