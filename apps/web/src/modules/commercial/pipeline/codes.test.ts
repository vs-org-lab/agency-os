import { describe, expect, it } from 'vitest';
import { schema } from '@agency-os/db';
import {
  OPEN_CODES,
  PIPELINE_CODES,
  PIPELINE_STAGES,
  pipelineCodeMessageKey,
  stageOf,
} from './codes';

describe('pipeline codes', () => {
  it('lists 34 codes in pipeline order', () => {
    expect(PIPELINE_CODES).toHaveLength(34);
    expect(PIPELINE_CODES.slice(0, 5)).toEqual(['0.1', '0.2', '0.3', '0.4', '1.1']);
    expect(PIPELINE_CODES.slice(-4)).toEqual(['X.1', 'X.2', 'X.3', 'X.4']);
    expect([...PIPELINE_CODES]).toEqual([...schema.PIPELINE_CODE_VALUES]);
  });

  it('maps every code to exactly one stage', () => {
    const listed = PIPELINE_STAGES.flatMap((entry) => entry.codes);
    expect([...listed].sort()).toEqual([...PIPELINE_CODES].sort());
    expect(stageOf('0.4')).toBe('pre_sale');
    expect(stageOf('1.6')).toBe('core');
    expect(stageOf('2.10')).toBe('orbit');
    expect(stageOf('3.1')).toBe('gravity');
    expect(stageOf('4.4')).toBe('constellation');
    expect(stageOf('X.2')).toBe('off_cycle');
  });

  it('builds message keys without dots', () => {
    expect(pipelineCodeMessageKey('0.1')).toBe('p0_1');
    expect(pipelineCodeMessageKey('2.10')).toBe('p2_10');
    expect(pipelineCodeMessageKey('X.4')).toBe('pX_4');
  });

  it('treats every code except X.3 and X.4 as open', () => {
    expect(OPEN_CODES).toHaveLength(32);
    expect(OPEN_CODES).not.toContain('X.3');
    expect(OPEN_CODES).not.toContain('X.4');
  });
});
