/** Room document files live in the library bucket under their own prefix. */
export function documentVersionPath(input: {
  organizationId: string;
  clientId: string;
  projectId: string;
  documentId: string;
  versionId: string;
}): string {
  return [
    'documents',
    input.organizationId,
    input.clientId,
    input.projectId,
    input.documentId,
    input.versionId,
  ].join('/');
}
