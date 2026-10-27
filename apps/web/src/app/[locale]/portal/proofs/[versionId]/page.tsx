import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { DecisionPanel } from '@/components/proofing/decision-panel';
import { ProofViewer } from '@/components/proofing/proof-viewer';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { VoiceNotePlayer } from '@/components/media/voice-note-player';
import { loadClientProofVersion } from '@/modules/proofing/server';
import { loadVoiceNotes } from '@/modules/voice-notes/server';
import { portalRoomAccess } from '../../room-session';
import { finishVoiceNoteAction, startVoiceNoteAction } from '../../../voice-note-actions';
import { commentOnClientProofAction, decideProofAction } from '../actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; versionId: string }> };

/** P-03 for a file: the client reads, comments on spots and, as decision maker, decides. */
export default async function PortalProofPage({ params }: PageProps) {
  const { locale: requested, versionId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/portal', locale);
  const access = portalRoomAccess(session.ctx.clientRoles);
  if (!access.readsRoom) notFound();
  const version = await loadClientProofVersion(session.claims, versionId);
  if (!version) notFound();
  const t = await getTranslations('proofing');
  const tMedia = await getTranslations('media.voiceNote');
  const pending = version.approval?.status === 'pending' ? version.approval : null;
  const [commentNotes, approvalNotes] = await Promise.all([
    loadVoiceNotes(
      session.claims,
      'proof_comment',
      version.comments.flatMap((comment) => [comment.id, ...comment.replies.map((r) => r.id)]),
    ),
    version.approval
      ? loadVoiceNotes(session.claims, 'approval_change_request', [version.approval.id])
      : Promise.resolve([]),
  ]);
  const voiceActions = { start: startVoiceNoteAction, finish: finishVoiceNoteAction };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/portal/proofs" className="text-body-sm text-link hover:underline">
          {t('clientList.title')}
        </Link>
        <h1 className="text-title text-text">{version.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          <span>{t('section.version', { number: version.number })}</span>
          <Badge variant="secondary">
            {t(`status.${version.approval?.status ?? 'noRequest'}`)}
          </Badge>
        </p>
      </header>
      {pending && access.decides ? (
        <DecisionPanel
          approvalId={pending.id}
          rounds={version.rounds}
          decide={decideProofAction}
          voiceActions={voiceActions}
        />
      ) : null}
      {approvalNotes.length > 0 ? (
        <section aria-label={tMedia('list')} className="flex flex-col gap-3">
          {approvalNotes.map((note) => (
            <VoiceNotePlayer key={note.id} note={note} />
          ))}
        </section>
      ) : null}
      <ProofViewer
        kind={version.kind}
        src={`/api/proofs/${versionId}/file`}
        title={version.title}
        number={version.number}
        pages={version.pages}
        previousVersion={version.previousVersion}
        comments={version.comments}
        audience="client"
        canComment
        addComment={commentOnClientProofAction.bind(null, versionId)}
        voiceNotes={commentNotes}
        voiceActions={voiceActions}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'proofing.clientList.title');
}
