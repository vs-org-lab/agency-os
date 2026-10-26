type Point = { x: number; y: number };

const STEP_MULTIPLIERS = [1, 2, 5, 10];

/** Round axis marks covering `min..max` (always including zero), with about `target` intervals. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const low = Math.min(min, 0);
  const high = Math.max(max, 0);
  if (high === low) return [0, 1];

  const rawStep = (high - low) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const multiplier = STEP_MULTIPLIERS.find((candidate) => candidate * magnitude >= rawStep) ?? 10;
  const step = multiplier * magnitude;
  const precision = Math.max(0, -Math.floor(Math.log10(step)) + 1);

  const first = Math.floor(low / step);
  const last = Math.ceil(high / step);
  const ticks: number[] = [];
  for (let index = first; index <= last; index += 1) {
    ticks.push(Number((index * step).toFixed(precision)));
  }
  return ticks;
}

/** SVG path data; a `null` entry breaks the line so missing values are not interpolated. */
export function linePath(points: Array<Point | null>): string {
  let path = '';
  let open = false;
  for (const point of points) {
    if (!point) {
      open = false;
      continue;
    }
    path += `${open ? 'L' : 'M'}${point.x} ${point.y}`;
    open = true;
  }
  return path;
}
