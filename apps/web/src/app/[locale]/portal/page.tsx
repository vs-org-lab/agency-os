import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { portalActionItems } from '@/components/portal/action-items';
import { gettingStartedSteps } from '@/components/portal/getting-started';
import { PortalHome } from '@/components/portal/portal-home';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalInvoices } from '@/modules/billing/server';
import { loadPortalProposal } from '@/modules/contracts/server';
import { loadPortalCore } from '@/modules/diagnosis/server';
import { isPortalOnboardingPending } from '@/modules/onboarding/server';
import { findProfileName, findVisibleClient } from '@/modules/organizations';
import { currentMonth } from '@/modules/results';
import { loadClientPortalResults } from '@/modules/results/server';
import { loadClientRequests, loadClientRetainer } from '@/modules/retainers/server';
import { loadClientPortalDocuments } from '@/modules/project-documents/server';
import { loadPortalApprovals, loadPortalRoom } from '@/modules/rooms/server';
import { loadColleagues } from '@/modules/team/server';
import { withUserContext } from '@/platform/db';
import { requestWorkAction } from '../retainer-actions';
import { dismissPortalOnboardingAction, hideGettingStartedAction } from './onboarding-actions';
import { ProposalHomeCard, proposalCardState } from './portal-cards';
import { portalRoomAccess } from './room-session';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

const PAYING_ROLES = ['decision_maker', 'client_finance'];

type PageProps = { params: Promise<{ locale: string }> };

export default async function PortalHomePage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const [clientId, roles = []] = [...session.ctx.clientRoles.entries()][0] ?? [];
  const pays = roles.some((role) => PAYING_ROLES.includes(role));
  const access = portalRoomAccess(session.ctx.clientRoles);
  const [core, proposal, invoices, room, approvals, retainer, requests, identity, results] =
    clientId
      ? await Promise.all([
          loadPortalCore(session.claims, clientId),
          loadPortalProposal(session.claims, clientId),
          pays ? loadPortalInvoices(session.claims, clientId) : Promise.resolve([]),
          access.readsRoom ? loadPortalRoom(session.claims, clientId) : Promise.resolve(null),
          access.readsRoom ? loadPortalApprovals(session.claims, clientId) : Promise.resolve([]),
          access.readsRoom ? loadClientRetainer(session.claims, clientId) : Promise.resolve(null),
          access.readsRoom ? loadClientRequests(session.claims, clientId) : Promise.resolve([]),
          withUserContext(session.claims, async (tx) => ({
            client: await findVisibleClient(tx, clientId),
            contactName: await findProfileName(tx, session.actor.userId),
          })),
          access.readsRoom
            ? loadClientPortalResults(session.claims, clientId)
            : Promise.resolve([]),
        ])
      : [null, null, [], null, [], null, [], null, []];
  const viewer = { userId: session.actor.userId, organizationId: session.actor.organizationId };
  const [tourPending, gettingStartedPending, sharedDocuments, colleagues] = await Promise.all([
    session.preview ? false : isPortalOnboardingPending(session.claims, viewer),
    session.preview
      ? true
      : isPortalOnboardingPending(session.claims, viewer, 'portal_getting_started'),
    clientId && access.readsRoom
      ? loadClientPortalDocuments(session.claims, clientId)
      : Promise.resolve([]),
    clientId && access.decides ? loadColleagues(session.claims, clientId) : Promise.resolve(null),
  ]);
  const t = await getTranslations('portal');
  const format = await getFormatter();

  const actions = portalActionItems({ decides: access.decides, approvals, proposal, invoices });
  const proposalCard = proposalCardState(proposal);
  const statusCard =
    proposalCard &&
    (proposalCard.kind === 'expired' ||
      (proposalCard.kind === 'contract' && proposalCard.stage !== 'to_sign'))
      ? proposalCard
      : null;
  const project = room?.project ?? null;
  const documents = core?.documents ?? [];
  const briefing = core?.briefing ?? null;

  const steps = gettingStartedSteps({
    toured: !tourPending && !session.preview,
    decides: access.decides,
    pays,
    proposal,
    invoices,
    colleagues: colleagues
      ? colleagues.filter((colleague) => colleague.status !== 'revoked').length
      : null,
  });

  return (
    <>
      <PortalHome
        client={identity?.client ?? null}
        contactName={session.preview ? null : (identity?.contactName ?? null)}
        now={new Date().toISOString()}
        actions={actions}
        retainer={retainer ? { view: retainer, requests, request: requestWorkAction } : null}
        project={project}
        results={{ kpis: results, currentMonth: currentMonth() }}
        documents={sharedDocuments}
        gettingStarted={gettingStartedPending ? { steps, hide: hideGettingStartedAction } : null}
        tour={{ autoStart: tourPending, onFinish: dismissPortalOnboardingAction }}
      >
        {statusCard ? <ProposalHomeCard state={statusCard} /> : null}
        {documents.length > 0 ? (
          <section aria-labelledby="portal-presentations" className="flex flex-col gap-3">
            <h2 id="portal-presentations" className="text-title-sm text-text">
              {t('core.presentations')}
            </h2>
            <ul className="flex flex-col gap-2">
              {documents.map((document) => (
                <li
                  key={document.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex flex-col">
                    <span className="text-body font-medium text-text">{document.title}</span>
                    <span className="text-caption text-text-tertiary">
                      {t('core.sharedOn', {
                        date: format.dateTime(document.sharedAt, { dateStyle: 'medium' }),
                      })}
                    </span>
                  </div>
                  <Link
                    href={`/portal/documents/${document.id}`}
                    className="text-body-sm text-link hover:underline"
                  >
                    {t('core.open')}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {briefing ? (
          <section aria-labelledby="portal-briefing" className="flex flex-col gap-4">
            <header className="flex flex-col gap-1">
              <h2 id="portal-briefing" className="text-title-sm text-text">
                {t('core.briefingTitle')}
              </h2>
              <p className="text-body text-text-secondary">{t('core.briefingDescription')}</p>
              <p className="text-caption text-text-tertiary">
                {t('core.sharedOn', {
                  date: format.dateTime(briefing.sharedAt, { dateStyle: 'medium' }),
                })}
              </p>
            </header>
            {briefing.guide.blocks.map((block) => {
              const notes = briefing.notes.filter((note) => note.blockId === block.id);
              if (notes.length === 0) return null;
              return (
                <article
                  key={block.id}
                  className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
                >
                  <h3 className="text-title-sm text-text">{block.title[locale]}</h3>
                  {notes.map((note) => {
                    const question = block.questions.find((entry) => entry.id === note.questionId);
                    return (
                      <div key={note.questionId ?? block.id} className="flex flex-col gap-1">
                        {question ? (
                          <span className="text-body-sm font-medium text-text">
                            {question.text[locale]}
                          </span>
                        ) : null}
                        <p className="whitespace-pre-line text-body text-text">{note.body}</p>
                      </div>
                    );
                  })}
                </article>
              );
            })}
          </section>
        ) : null}
      </PortalHome>
    </>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'portal.home.title');
}
