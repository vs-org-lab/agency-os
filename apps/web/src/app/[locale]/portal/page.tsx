import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@agency-os/ui/components/states/empty-state';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { loadPortalProposal } from '@/modules/contracts/server';
import { loadPortalCore } from '@/modules/diagnosis/server';

type PageProps = { params: Promise<{ locale: string }> };

export default async function PortalHomePage({ params }: PageProps) {
  const locale = requireLocale((await params).locale);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const clientId = [...session.ctx.clientRoles.keys()][0];
  const [core, proposal] = clientId
    ? await Promise.all([
        loadPortalCore(session.claims, clientId),
        loadPortalProposal(session.claims, clientId),
      ])
    : [null, null];
  const t = await getTranslations('portal');
  const format = await getFormatter();

  if (!proposal && (!core || (!core.briefing && core.documents.length === 0))) {
    return <EmptyState title={t('home.title')} description={t('home.description')} />;
  }

  const briefing = core?.briefing ?? null;
  const documents = core?.documents ?? [];

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-8">
      {proposal && proposal.status === 'accepted' && proposal.contractId ? (
        <section
          aria-labelledby="portal-contract"
          className="flex flex-col gap-2 rounded-lg border-2 border-text bg-surface p-4"
        >
          <h2 id="portal-contract" className="text-title-sm text-text">
            {t('contract.homeTitle')}
          </h2>
          <Link
            href={`/portal/contracts/${proposal.contractId}`}
            className="text-body-sm text-link hover:underline"
          >
            {t('contract.homeOpen')}
          </Link>
        </section>
      ) : null}
      {proposal && proposal.status === 'sent' && !proposal.expired ? (
        <section
          aria-labelledby="portal-proposal"
          className="flex flex-col gap-2 rounded-lg border-2 border-text bg-surface p-4"
        >
          <h2 id="portal-proposal" className="text-title-sm text-text">
            {t('home.proposalTitle')}
          </h2>
          <p className="text-body-sm text-text-secondary">{t('home.proposalBody')}</p>
          <Link href="/portal/proposal" className="text-body-sm text-link hover:underline">
            {t('home.proposalOpen')}
          </Link>
        </section>
      ) : null}
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
