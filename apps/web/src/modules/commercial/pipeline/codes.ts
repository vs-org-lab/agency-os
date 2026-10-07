export const PIPELINE_CODES = [
  '0.1',
  '0.2',
  '0.3',
  '0.4',
  '1.1',
  '1.2',
  '1.3',
  '1.4',
  '1.5',
  '1.6',
  '2.1',
  '2.2',
  '2.3',
  '2.4',
  '2.5',
  '2.6',
  '2.7',
  '2.8',
  '2.9',
  '2.10',
  '3.1',
  '3.2',
  '3.3',
  '3.4',
  '3.5',
  '3.6',
  '4.1',
  '4.2',
  '4.3',
  '4.4',
  'X.1',
  'X.2',
  'X.3',
  'X.4',
] as const;

export type PipelineCode = (typeof PIPELINE_CODES)[number];

export type PipelineStage =
  'pre_sale' | 'core' | 'orbit' | 'gravity' | 'constellation' | 'off_cycle';

const STAGE_PREFIX: Record<string, PipelineStage> = {
  '0': 'pre_sale',
  '1': 'core',
  '2': 'orbit',
  '3': 'gravity',
  '4': 'constellation',
  X: 'off_cycle',
};

export function stageOf(code: PipelineCode): PipelineStage {
  const stage = STAGE_PREFIX[code.split('.')[0] ?? ''];
  if (!stage) throw new Error(`Unknown pipeline code: ${code}`);
  return stage;
}

const STAGE_ORDER: readonly PipelineStage[] = [
  'pre_sale',
  'core',
  'orbit',
  'gravity',
  'constellation',
  'off_cycle',
];

export const PIPELINE_STAGES: ReadonlyArray<{
  stage: PipelineStage;
  codes: readonly PipelineCode[];
}> = STAGE_ORDER.map((stage) => ({
  stage,
  codes: PIPELINE_CODES.filter((code) => stageOf(code) === stage),
}));

export const OFF_CYCLE_CODES: readonly PipelineCode[] = ['X.1', 'X.2', 'X.3', 'X.4'];

export const FINAL_CODES: readonly PipelineCode[] = ['X.3', 'X.4'];

export const OPEN_CODES: readonly PipelineCode[] = PIPELINE_CODES.filter(
  (code) => !FINAL_CODES.includes(code),
);

export function isPipelineCode(value: string): value is PipelineCode {
  return (PIPELINE_CODES as readonly string[]).includes(value);
}

export function pipelineCodeMessageKey(code: PipelineCode): string {
  return `p${code.replace('.', '_')}`;
}
