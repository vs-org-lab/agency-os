/** A path segment inside the archive that cannot climb out of it or split into more segments. */
export function safeZipSegment(segment: string): string {
  const cleaned = segment.trim().replace(/[/\\\u0000-\u001f\u007f]/g, '_');
  return cleaned === '' || cleaned === '.' || cleaned === '..' ? '_' : cleaned;
}

function withSuffix(path: string, count: number): string {
  const slash = path.lastIndexOf('/');
  const dot = path.lastIndexOf('.');
  if (dot <= slash + 1) return `${path} (${count})`;
  return `${path.slice(0, dot)} (${count})${path.slice(dot)}`;
}

/** ZIP entry paths in order, with " (2)", " (3)", … added to repeats, ignoring case. */
export function zipEntryNames(paths: string[]): string[] {
  const taken = new Set<string>();
  return paths.map((path) => {
    let candidate = path;
    for (let count = 2; taken.has(candidate.toLowerCase()); count += 1) {
      candidate = withSuffix(path, count);
    }
    taken.add(candidate.toLowerCase());
    return candidate;
  });
}
