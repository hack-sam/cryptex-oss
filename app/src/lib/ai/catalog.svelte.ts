import { browser } from '$app/environment';
import type { Model } from './types';
import { listProviders } from './providers.svelte';
import { openrouterAdapter } from './adapters/openrouter';
// Future adapters added in Commits 2 and 3.

const CACHE_KEY = 'cryptex.catalogCache.v2';
const CACHE_TTL_MS = 60 * 60 * 1000;

type Status = 'idle' | 'loading' | 'ready' | 'error';
type CacheShape = { models: Model[]; fetchedAt: number };

let status = $state<Status>('idle');
let items = $state<Model[]>([]);
let fetchedAt = $state<number | null>(null);
let error = $state<string>('');
let abortController: AbortController | null = null;

function loadCache(): CacheShape | null {
  if (!browser) return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheShape;
  } catch { return null; }
}
function saveCache(models: Model[], ts: number): void {
  if (!browser) return;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ models, fetchedAt: ts })); } catch { /* ignore */ }
}

async function fetchAll(signal: AbortSignal): Promise<Model[]> {
  const providers = listProviders().filter((p) => p.enabled);
  const results: Model[] = [];
  for (const p of providers) {
    try {
      if (p.id === 'openrouter') {
        const a = openrouterAdapter(p);
        const models = await a.fetchCatalog(signal);
        results.push(...models);
      }
      // anthropic + openai-compat land in later commits
    } catch (e) {
      // per-provider failure does not fail the whole catalog
      if ((e as Error)?.name === 'AbortError') throw e;
      console.warn(`[catalog] ${p.id} fetch failed:`, e);
    }
  }
  return results;
}

export async function refreshCatalog(force = false, signal?: AbortSignal): Promise<void> {
  if (!browser) return;
  if (!force && fetchedAt && Date.now() - fetchedAt < CACHE_TTL_MS && items.length > 0) return;
  if (abortController) abortController.abort();
  abortController = new AbortController();
  signal?.addEventListener('abort', () => abortController?.abort(), { once: true });
  status = 'loading';
  error = '';
  try {
    const models = await fetchAll(abortController.signal);
    items = models;
    fetchedAt = Date.now();
    status = 'ready';
    saveCache(models, fetchedAt);
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
    error = (e as Error)?.message ?? 'catalog fetch failed';
    status = 'error';
  } finally {
    abortController = null;
  }
}

function hydrate(): void {
  if (status !== 'idle') return;
  const cached = loadCache();
  if (cached) { items = cached.models; fetchedAt = cached.fetchedAt; status = 'ready'; }
}

export const catalog = {
  get status(): Status { return status; },
  get error(): string { return error; },
  get list(): ReadonlyArray<Model> { return items; },
  get fetchedAt(): number | null { return fetchedAt; },
  refresh(force = true): Promise<void> { return refreshCatalog(force); },
  find(qualifiedId: string): Model | undefined { return items.find((m) => m.qualifiedId === qualifiedId || m.id === qualifiedId); },
  get byUpstream(): Record<string, Model[]> {
    const out: Record<string, Model[]> = {};
    for (const m of items) (out[m.upstreamProvider || 'Other'] ||= []).push(m);
    return out;
  }
};

export function initCatalogStore(): void {
  if (!browser) return;
  hydrate();
  if (status === 'idle' || (fetchedAt && Date.now() - fetchedAt > CACHE_TTL_MS)) {
    queueMicrotask(() => { refreshCatalog(false); });
  }
}
