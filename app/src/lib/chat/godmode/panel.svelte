<script lang="ts">
  import { runGodmode } from './client';
  import type { EngineEvent } from './types';
  import { session } from '$lib/auth/session.svelte';
  import X from 'lucide-svelte/icons/x';

  type Props = {
    onClose?: () => void;
  };
  let { onClose }: Props = $props();

  let task = $state('');
  let K: 3 | 6 | 12 = $state(6);
  let model = $state('claude-sonnet-4-6');
  let events: EngineEvent[] = $state([]);
  let running = $state(false);
  let controller: AbortController | null = null;

  async function go() {
    if (running) return;
    events = [];
    running = true;
    controller = new AbortController();
    try {
      const jwt = session.supabaseSession?.access_token;
      if (!jwt) {
        events = [
          ...events,
          {
            v: 1,
            type: 'error',
            code: 'no_session',
            message: 'Not signed in. Godmode requires an authenticated session.'
          }
        ];
        return;
      }
      for await (const e of runGodmode({
        task,
        K,
        model,
        jwt,
        signal: controller.signal
      })) {
        events = [...events, e];
      }
    } catch (err) {
      events = [
        ...events,
        { v: 1, type: 'error', code: 'client_error', message: String(err) }
      ];
    } finally {
      running = false;
      controller = null;
    }
  }

  function stop() {
    controller?.abort();
  }
</script>

<aside
  class="flex h-full w-[440px] shrink-0 flex-col border-l border-border/50 bg-card/30 backdrop-blur-sm"
  aria-label="Godmode"
>
  <div class="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-border/50 bg-card/80 px-4 py-3">
    <div class="flex flex-col">
      <span class="text-sm font-semibold text-foreground">Godmode</span>
      <span class="text-[10px] text-muted-foreground">Server engine — ranks K DNAs, races, returns best</span>
    </div>
    {#if onClose}
      <button
        type="button"
        onclick={onClose}
        class="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
        aria-label="Close godmode panel"
      >
        <X size={14} />
      </button>
    {/if}
  </div>

  <div class="godmode-panel">
    <label>
      Task
      <textarea bind:value={task} rows="4" placeholder="What do you want godmode to do?"></textarea>
    </label>

    <label>
      Candidates (K)
      <div class="k-pills">
        {#each [3, 6, 12] as k}
          <button
            type="button"
            class:active={K === k}
            onclick={() => (K = k as 3 | 6 | 12)}
          >{k}</button>
        {/each}
      </div>
    </label>

    <label>
      Target model
      <input bind:value={model} placeholder="e.g. claude-sonnet-4-6" />
    </label>

    <div class="actions">
      {#if running}
        <button type="button" onclick={stop}>Stop</button>
      {:else}
        <button type="button" onclick={go} disabled={!task.trim()}>Run godmode</button>
      {/if}
    </div>

    <ul class="events">
      {#each events as e}
        <li class="ev ev-{e.type}">
          <code>{e.type}</code>
          {JSON.stringify(e).slice(0, 200)}
        </li>
      {/each}
    </ul>
  </div>
</aside>

<style>
  .godmode-panel { display: flex; flex-direction: column; gap: 0.75rem; padding: 1rem; overflow-y: auto; }
  .k-pills { display: inline-flex; gap: 0.25rem; margin-left: 0.5rem; }
  .k-pills button { padding: 0.25rem 0.5rem; border: 1px solid currentColor; border-radius: 0.25rem; background: transparent; cursor: pointer; }
  .k-pills button.active { background: currentColor; color: var(--bg, #fff); }
  .actions { display: flex; gap: 0.5rem; }
  .events { font-family: monospace; font-size: 0.8em; max-height: 400px; overflow-y: auto; padding: 0; list-style: none; }
  .ev { padding: 0.25rem 0; border-bottom: 1px solid rgba(128,128,128,0.2); }
  .ev-winner code { color: green; font-weight: 600; }
  .ev-error code, .ev-candidate_failed code { color: orange; }
</style>
