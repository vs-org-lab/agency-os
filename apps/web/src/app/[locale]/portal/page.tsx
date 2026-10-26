import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalInvoices } from '@/modules/billing/server';
import { loadPortalProposal } from '@/modules/contracts/server';
import { loadPortalCore } from '@/modules/diagnosis/server';
import { loadPortalApprovals, loadPortalRoom } from '@/modules/rooms/server';
import {
  PaymentHomeCard,
  paymentCardState,
  ProposalHomeCard,
  proposalCardState,
} from './portal-cards';
import { RoomHomeCard, roomCardState } from './room-cards';
import { portalRoomAccess } from './room-session';
import { pageMetadata } from '@/i18n/page-title';

const PAYING_ROLES = ['decision_maker', 'client_finance'];

type PageProps = { params: Promise<{ locale: string }> };

export default async function PortalHomePage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const [clientId, roles = []] = [...session.ctx.clientRoles.entries()][0] ?? [];
  const pays = roles.some((role) => PAYING_ROLES.includes(role));
  const access = portalRoomAccess(session.ctx.clientRoles);
  const [core, proposal, invoices, room, approvals] = clientId
    ? await Promise.all([
        loadPortalCore(session.claims, clientId),
        loadPortalProposal(session.claims, clientId),
        pays ? loadPortalInvoices(session.claims, clientId) : Promise.resolve([]),
        access.readsRoom ? loadPortalRoom(session.claims, clientId) : Promise.resolve(null),
        access.readsRoom ? loadPortalApprovals(session.claims, clientId) : Promise.resolve([]),
      ])
    : [null, null, [], null, []];
  const t = await getTranslations('portal');
  const format = await getFormatter();

  const card = proposalCardState(proposal);
  const payment = paymentCardState(invoices);
  const roomCard = room?.project ? roomCardState(room.project, approvals.length) : null;
  if (
    !card &&
    !payment &&
    !roomCard &&
    (!core || (!core.briefing && core.documents.length === 0))
  ) {
    return <EmptyState title={t('home.title')} description={t('home.description')} />;
  }

  const briefing = core?.briefing ?? null;
  const documents = core?.documents ?? [];

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-8">
      {roomCard ? <RoomHomeCard state={roomCard} /> : null}
      {payment ? <PaymentHomeCard state={payment} /> : null}
      {card ? <ProposalHomeCard state={card} /> : null}
      {documents.length > 0 ? (
        <section aria-labelledby="portal-presentations" className="flex flex-col gap-3">
          <h1 id="portal-presentations" className="text-title text-text">
            {t('core.presentations')}
          </h1>
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
            <h2 id="portal-briefing" className="text-title text-text">
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
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'portal.home.title');
}
