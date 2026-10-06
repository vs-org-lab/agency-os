export function isSecureRequest(headers: Headers, fallbackProtocol?: string): boolean {
  const forwarded = headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  return (forwarded ?? fallbackProtocol?.replace(':', '')) === 'https';
}

export function requestOrigin(headers: Headers): string {
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? 'localhost:3000';
  return `${isSecureRequest(headers) ? 'https' : 'http'}://${host}`;
}

export function clientIpAddress(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || null;
}
