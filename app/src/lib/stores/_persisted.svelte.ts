/**
 * Single helper for reactive localStorage-backed stores using Svelte 5 runes.
 * Every persistent store in this project uses this — no one writes raw $effect + localStorage.
 */
import { browser } from '$app/environment';

export function createPersistedState<T>(key: string, initial: T) {
  let value = $state<T>(initial);

  if (browser) {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) value = JSON.parse(raw) as T;
    } catch {
      /* corrupt entry — fall back to initial */
    }

    $effect.root(() => {
      $effect(() => {
        try {
          localStorage.setItem(key, JSON.stringify(value));
        } catch {
          /* quota / disabled — silently drop */
        }
      });
    });
  }

  return {
    get value() { return value; },
    set value(next: T) {
      // Dedup structurally-equal writes. Without this, an $effect that writes a
      // fresh spread of its own persisted value (e.g. `s.value = { ...s.value,
      // goal }`) ends up depending on the value it writes and loops forever
      // (effect_update_depth_exceeded), which crashes hydration. Persisted
      // states are small and already JSON-serialized for storage, so comparing
      // the serialized form is cheap and consistent with how they persist.
      try {
        if (JSON.stringify(next) === JSON.stringify(value)) return;
      } catch {
        /* non-serializable value — fall through and assign */
      }
      value = next;
    }
  };
}
