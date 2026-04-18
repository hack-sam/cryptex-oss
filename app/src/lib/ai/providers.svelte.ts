import { browser } from '$app/environment';
import type { ProviderRecord, ProviderId } from './types';

const STORAGE_KEY = 'cryptex.providers';

function tryGetLS(key: string): string | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch { /* ignore */ }
  return null;
}

function trySetLS(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch { /* ignore */ }
}

function seedInitial(): ProviderRecord[] {
  // Try to read legacy key from localStorage (works in browser and in test mocks on globalThis)
  const legacyKey = (tryGetLS('cryptex.openrouterApiKey') || '').trim();
  return [{ id: 'openrouter', apiKey: legacyKey, enabled: true }];
}

function loadPersisted(): ProviderRecord[] | null {
  const raw = tryGetLS(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ProviderRecord[]; } catch { return null; }
}

// Module-level state — rune-backed so Svelte components re-render on change
let _records = $state<ProviderRecord[]>(loadPersisted() ?? seedInitial());

function persist(): void {
  trySetLS(STORAGE_KEY, JSON.stringify(_records));
}

// Public functions are synchronous and work in both SSR and browser environments.
// Svelte components can read _records directly via listProviders(); $state ensures
// reactive re-renders whenever a mutating function replaces the array.

export function listProviders(): ProviderRecord[] {
  return _records;
}

export function getProvider(id: ProviderId, instanceId?: string): ProviderRecord | undefined {
  return _records.find((p) => {
    if (p.id !== id) return false;
    if (id === 'openai-compat' && instanceId) return (p as { instanceId: string }).instanceId === instanceId;
    return true;
  });
}

export function addProvider(record: ProviderRecord): void {
  _records = [..._records, record];
  persist();
}

export function updateProvider(
  id: ProviderId,
  patch: Partial<ProviderRecord>,
  instanceId?: string
): void {
  _records = _records.map((p) => {
    if (p.id !== id) return p;
    if (id === 'openai-compat' && instanceId && (p as { instanceId: string }).instanceId !== instanceId) return p;
    return { ...p, ...patch } as ProviderRecord;
  });
  persist();
}

export function removeProvider(id: ProviderId, instanceId?: string): void {
  _records = _records.filter((p) => {
    if (p.id !== id) return true;
    if (id === 'openai-compat' && instanceId) return (p as { instanceId: string }).instanceId !== instanceId;
    return false;
  });
  persist();
}

export function hasAnyKey(): boolean {
  return _records.some((p) => p.enabled && 'apiKey' in p && Boolean(p.apiKey));
}

// Provider records are backed by $state (see _records above); Svelte components
// re-render automatically when any mutating function (addProvider, updateProvider,
// removeProvider) assigns a new array to _records.
