import type { KeyInfo, ProviderId } from './types';

const DEBOUNCE_MS = 800;
const THROTTLE_MS = 3000;
const LOCKOUT_401_THRESHOLD = 3;
const LOCKOUT_DURATION_MS = 60_000;

export type Probe = (candidate: string, signal: AbortSignal) => Promise<KeyInfo>;

type State = {
  lastKey?: string;
  lastValidatedAt?: number;
  consecutiveAuthFails: number;
  lockoutUntil?: number;
  debounceTimer?: ReturnType<typeof setTimeout>;
  inflight?: AbortController;
  lastResult?: KeyInfo | { error: unknown };
};

const states = new Map<string, State>();
const listeners = new Map<string, Set<(r: KeyInfo | { error: unknown }) => void>>();

function stateKey(provider: ProviderId, instanceId?: string): string {
  return instanceId ? `${provider}::${instanceId}` : provider;
}

function getState(provider: ProviderId, instanceId?: string): State {
  const k = stateKey(provider, instanceId);
  let s = states.get(k);
  if (!s) { s = { consecutiveAuthFails: 0 }; states.set(k, s); }
  return s;
}

export function subscribeValidation(
  provider: ProviderId,
  instanceId: string | undefined,
  fn: (r: KeyInfo | { error: unknown }) => void
): () => void {
  const k = stateKey(provider, instanceId);
  let set = listeners.get(k);
  if (!set) { set = new Set(); listeners.set(k, set); }
  set.add(fn);
  return () => { set?.delete(fn); };
}

function emit(provider: ProviderId, instanceId: string | undefined, r: KeyInfo | { error: unknown }): void {
  listeners.get(stateKey(provider, instanceId))?.forEach((fn) => fn(r));
}

export function scheduleValidate(
  provider: ProviderId,
  instanceId: string | undefined,
  candidate: string,
  probe: Probe
): void {
  const s = getState(provider, instanceId);

  if (s.lockoutUntil && Date.now() < s.lockoutUntil) return;
  if (s.debounceTimer) clearTimeout(s.debounceTimer);
  if (s.inflight) s.inflight.abort();

  s.debounceTimer = setTimeout(async () => {
    s.debounceTimer = undefined;
    if (s.lastKey === candidate && s.lastValidatedAt && Date.now() - s.lastValidatedAt < THROTTLE_MS) return;

    const ctrl = new AbortController();
    s.inflight = ctrl;
    try {
      const info = await probe(candidate, ctrl.signal);
      s.lastKey = candidate;
      s.lastValidatedAt = Date.now();
      s.consecutiveAuthFails = 0;
      s.lastResult = info;
      emit(provider, instanceId, info);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      const status = (err as { status?: number })?.status;
      if (status === 401 || status === 403) {
        s.consecutiveAuthFails += 1;
        if (s.consecutiveAuthFails >= LOCKOUT_401_THRESHOLD) s.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
      }
      s.lastResult = { error: err };
      emit(provider, instanceId, { error: err });
    } finally {
      s.inflight = undefined;
    }
  }, DEBOUNCE_MS);
}

export async function verifyNow(
  provider: ProviderId,
  instanceId: string | undefined,
  candidate: string,
  probe: Probe
): Promise<KeyInfo> {
  const s = getState(provider, instanceId);
  if (s.debounceTimer) { clearTimeout(s.debounceTimer); s.debounceTimer = undefined; }
  if (s.inflight) s.inflight.abort();
  const ctrl = new AbortController();
  s.inflight = ctrl;
  try {
    const info = await probe(candidate, ctrl.signal);
    s.lastKey = candidate;
    s.lastValidatedAt = Date.now();
    s.consecutiveAuthFails = 0;
    s.lastResult = info;
    emit(provider, instanceId, info);
    return info;
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status === 401 || status === 403) {
      s.consecutiveAuthFails += 1;
      if (s.consecutiveAuthFails >= LOCKOUT_401_THRESHOLD) s.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    }
    s.lastResult = { error: err };
    emit(provider, instanceId, { error: err });
    throw err;
  } finally {
    s.inflight = undefined;
  }
}

/** Test-only. Do not import from app code. */
export function _resetValidationStateForTests(): void {
  states.clear();
  listeners.clear();
}
