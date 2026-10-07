const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'sapo.pt',
  'mail.pt',
  'clix.pt',
]);

export function isPersonalEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split('@')[1];
  return domain !== undefined && PERSONAL_EMAIL_DOMAINS.has(domain);
}
