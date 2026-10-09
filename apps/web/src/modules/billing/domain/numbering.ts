const REQUEST_PREFIX = 'PP';

/** Payment request numbers are separate from fiscal numbering, which only certified software assigns. */
export function formatRequestNumber(year: number, sequence: number): string {
  return `${REQUEST_PREFIX}-${year}-${String(sequence).padStart(4, '0')}`;
}
