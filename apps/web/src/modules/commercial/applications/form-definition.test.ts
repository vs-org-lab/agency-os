import { describe, expect, it } from 'vitest';
import { DEFAULT_APPLICATION_FORM } from './default-form';
import { applicationFormDefinitionSchema, type ApplicationFormDefinition } from './form-definition';

function withChanges(
  change: (definition: ApplicationFormDefinition) => void,
): ApplicationFormDefinition {
  const copy = structuredClone(DEFAULT_APPLICATION_FORM);
  change(copy);
  return copy;
}

describe('applicationFormDefinitionSchema', () => {
  it('accepts the default form', () => {
    expect(applicationFormDefinitionSchema.safeParse(DEFAULT_APPLICATION_FORM).success).toBe(true);
  });

  it('definition schema rejects duplicate ids, dangling showIf and inverted thresholds', () => {
    const duplicate = withChanges((definition) => {
      const first = definition.questions[2];
      if (first) definition.questions.push({ ...first });
    });
    const dangling = withChanges((definition) => {
      const question = definition.questions.find((entry) => entry.id === 'decision_maker_present');
      if (question) question.showIf = { questionId: 'missing', optionId: 'other' };
    });
    const inverted = withChanges((definition) => {
      definition.thresholds = { a: 6, b: 9 };
    });

    expect(applicationFormDefinitionSchema.safeParse(duplicate).success).toBe(false);
    expect(applicationFormDefinitionSchema.safeParse(dangling).success).toBe(false);
    expect(applicationFormDefinitionSchema.safeParse(inverted).success).toBe(false);
  });

  it('rejects a single choice question without options', () => {
    const empty = withChanges((definition) => {
      const question = definition.questions.find((entry) => entry.id === 'sector');
      if (question) question.options = [];
    });
    expect(applicationFormDefinitionSchema.safeParse(empty).success).toBe(false);
  });
});
