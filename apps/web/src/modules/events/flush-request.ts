/**
 * A flush request only asks the dispatcher to run sooner; the five-minute sweep delivers the events
 * anyway. A user action therefore never waits longer than the timeout for it, whatever the event
 * service does with its own retries.
 */
export async function boundedFlushRequest(
  send: () => Promise<void>,
  timeoutMs: number,
  onFailure: (error: unknown) => void,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('flush_request_timeout')), timeoutMs);
  });
  try {
    await Promise.race([send(), timeout]);
  } catch (error) {
    onFailure(error);
  } finally {
    clearTimeout(timer);
  }
}
