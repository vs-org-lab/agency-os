export const CLIENT_COLOR_COUNT = 8;

/** A stable colour slot for a client, from a hash of its id, so it never changes between views. */
export function clientColor(clientId: string): number {
  let hash = 0;
  for (const character of clientId) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash % CLIENT_COLOR_COUNT;
}
