export function hubAssetPath(input: {
  organizationId: string;
  clientId: string;
  assetId: string;
}): string {
  return ['brand-hub', input.organizationId, input.clientId, input.assetId].join('/');
}
