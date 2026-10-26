/** Text a screen reader gets from a NumberFlow host, without the inline style element it injects. */
export function accessibleNumberText(container: HTMLElement): string {
  const host = container.querySelector('number-flow-react');
  if (!host) throw new Error('number-flow-react host not rendered');
  const clone = host.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('style').forEach((node) => node.remove());
  return (clone.textContent ?? '').replace(/\s/g, ' ');
}
