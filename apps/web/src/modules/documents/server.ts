import 'server-only';
import { withUserContext, type VerifiedClaims } from '@/platform/db';
import { getPortalDocument, listPortalDocuments } from './portal';
import { removeDocument, saveDocument, shareDocument, withdrawDocument } from './service';

export { getPortalDocument, listPortalDocuments };

const contexts = { withUserContext };

type Session = { claims: VerifiedClaims };

export function saveCoreDocument(
  session: Session,
  input: { documentId?: string; dealId: string; title: string; url: string },
) {
  return saveDocument(session.claims, input, { contexts });
}

export function shareCoreDocument(session: Session, documentId: string) {
  return shareDocument(session.claims, { documentId }, { contexts });
}

export function withdrawCoreDocument(session: Session, documentId: string) {
  return withdrawDocument(session.claims, { documentId }, { contexts });
}

export function removeCoreDocument(session: Session, documentId: string) {
  return removeDocument(session.claims, { documentId }, { contexts });
}

export function loadPortalDocuments(session: Session, clientId: string) {
  return withUserContext(session.claims, (tx) => listPortalDocuments(tx, clientId));
}

export function loadPortalDocument(session: Session, documentId: string) {
  return withUserContext(session.claims, (tx) => getPortalDocument(tx, documentId));
}
