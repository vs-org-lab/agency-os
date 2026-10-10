function keepsAnother(activeIds: string[], userId: string): boolean {
  return !activeIds.includes(userId) || activeIds.some((id) => id !== userId);
}

/** The organisation always keeps an active founder. */
export function canLoseFounder(activeFounderIds: string[], userId: string): boolean {
  return keepsAnother(activeFounderIds, userId);
}

/** A client always keeps an active decision maker. */
export function canLoseDecisionMaker(activeDecisionMakerIds: string[], userId: string): boolean {
  return keepsAnother(activeDecisionMakerIds, userId);
}
