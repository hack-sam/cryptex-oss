/**
 * @deprecated Since 2026-04-18. Use `$lib/ai/catalog.svelte` instead. This shim
 * will be removed in Commit 6 of the gateway rollout.
 */
import { catalog, initCatalogStore, refreshCatalog } from './catalog.svelte';
import type { Model } from './types';

export { initCatalogStore as initModelsStore, refreshCatalog as refreshModels };

export const models = {
  get status() { return catalog.status; },
  get error() { return catalog.error; },
  get list(): ReadonlyArray<Model> { return catalog.list; },
  get isLive() { return catalog.status === 'ready' && catalog.list.length > 0; },
  get fetchedAt(): number | null { return catalog.fetchedAt; },
  refresh(force = true): Promise<void> { return catalog.refresh(force); },
  find(id: string): Model | undefined { return catalog.find(id); },
  get byProvider(): Record<string, Model[]> { return catalog.byUpstream; }
};
