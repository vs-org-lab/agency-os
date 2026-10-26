import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@agency-os/ui/components/badge';
import { ProofViewer } from '@/components/proofing/proof-viewer';
import { requireArea } from '@/components/shell/session-guard';
import { Link } from '@/i18n/navigation';
import { requireLocale } from '@/i18n/require-locale';
import { VoiceNotePlayer } from '@/components/media/voice-note-player';
import { loadStaffProofVersion } from '@/modules/proofing/server';
import { loadVoiceNotes } from '@/modules/voice-notes/server';
import { finishVoiceNoteAction, startVoiceNoteAction } from '../../../../voice-note-actions';
import { commentOnProofAction, resolveProofCommentAction } from '../../proof-actions';
import { pageMetadata } from '@/i18n/page-title';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ locale: string; clientId: string; versionId: string }> };

/** The room team's view of a file version, with every comment including internal ones. */
export default async function StaffProofPage({ params }: PageProps) {
  const { locale: requested, clientId, versionId } = await params;
  const locale = requireLocale(requested);
  setRequestLocale(locale);
  const session = await requireArea('/', locale);
  const version = await loadStaffProofVersion(session.claims, versionId);
  if (!version || version.clientId !== clientId) notFound();
  const t = await getTranslations('proofing');
  const tMedia = await getTranslations('media.voiceNote');
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
  const commentOnVersion = commentOnProofAction.bind(null, versionId);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href={`/c/${clientId}`} className="text-body-sm text-link hover:underline">
          {t('section.title')}
        </Link>
        <h1 className="text-title text-text">{version.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          <span>{t('section.version', { number: version.number })}</span>
          <Badge variant="secondary">
            {t(`status.${version.approval?.status ?? 'noRequest'}`)}
          </Badge>
          <span>
            {t('section.rounds', { used: version.rounds.used, limit: version.rounds.limit })}
          </span>
        </p>
      </header>
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
        audience="team"
        canComment
        addComment={commentOnVersion}
        voiceNotes={commentNotes}
        voiceActions={{ start: startVoiceNoteAction, finish: finishVoiceNoteAction }}
        resolveComment={resolveProofCommentAction}
      />
    </div>
  );
}

export function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return pageMetadata(params, 'proofing.section.title');
}
