const key = (slug: string) => `brand-hub-token:${slug}`;

/** The visitor's token for one hub; storage may be unavailable, which only costs a new sign-in. */
export const tokenStore = {
  get(slug: string): string | null {
    try {
      return window.localStorage.getItem(key(slug));
    } catch {
      return null;
    }
  },
  set(slug: string, token: string): void {
    try {
      window.localStorage.setItem(key(slug), token);
    } catch {
      return;
    }
  },
  clear(slug: string): void {
    try {
      window.localStorage.removeItem(key(slug));
    } catch {
      return;
    }
  },
};
