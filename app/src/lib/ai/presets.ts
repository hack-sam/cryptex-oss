import type { ProviderPreset } from './types';

/** OpenAI-compatible presets. Final contents land in Commit 3. */
export const OPENAI_COMPAT_PRESETS: ProviderPreset[] = [
  { id: 'custom', name: 'Custom', baseURL: '', docsUrl: '', defaultTestModel: undefined, supportsAuthProbe: false }
];
