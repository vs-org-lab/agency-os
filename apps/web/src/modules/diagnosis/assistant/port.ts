import { buildPrompt, type CoreAssistantRequest } from './prompts';

export type CoreAssistantDraft =
  { mode: 'manual'; prompt: string } | { mode: 'generated'; text: string };

export type CoreAssistant = {
  draft(request: CoreAssistantRequest): Promise<CoreAssistantDraft>;
};

/** Until launch the founder runs the prompt in Claude and pastes the result back (ADR 0003). */
export function createManualAssistant(): CoreAssistant {
  return {
    async draft(request) {
      return { mode: 'manual', prompt: buildPrompt(request) };
    },
  };
}
