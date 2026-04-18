import type { LanguageModelV2, LanguageModelV3 } from '@ai-sdk/provider';
import type { ProviderId, Model, KeyInfo } from '../types';

export type LanguageModel = LanguageModelV2 | LanguageModelV3;

export interface Adapter {
  readonly id: ProviderId;
  readonly instanceId?: string;
  isConfigured(): boolean;
  validateKey(candidate: string, signal?: AbortSignal): Promise<KeyInfo>;
  resolveModel(modelId: string): LanguageModel;
  fetchCatalog(signal?: AbortSignal): Promise<Model[]>;
}
