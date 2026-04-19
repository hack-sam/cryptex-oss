<script lang="ts">
  import { allTechniques, search } from '$lib/chat/techniques/registry';
  import { pushRecent } from '$lib/stores/techniqueRecents.svelte';
  import type { Technique, TechniqueCategory } from '$lib/chat/techniques/types';
  import type { ChatRow } from '$lib/chat/types';
  import TechniqueSearchInput from './TechniqueSearchInput.svelte';
  import TechniqueGroup from './TechniqueGroup.svelte';
  import TechniqueRecent from './TechniqueRecent.svelte';
  import Zap from 'lucide-svelte/icons/zap';
  import { onMount } from 'svelte';

  type Props = { chat?: ChatRow };
  let { chat }: Props = $props();

  let query = $state('');
  let searchInputRef = $state<HTMLInputElement | null>(null);

  const filtered = $derived(query.trim() ? search(query) : allTechniques());

  function items(cat: TechniqueCategory): Technique[] {
    return filtered.filter((t) => t.category === cat);
  }

  const transform = $derived(items('transform'));
  const mutate = $derived(items('mutate'));
  const classifier = $derived(items('classifier'));
  const composite = $derived(items('composite'));
  const mode = $derived(items('mode'));
  const godmode = $derived(items('godmode'));

  function handleClick(t: Technique) {
    pushRecent(t.id);
    window.dispatchEvent(new CustomEvent('technique:select', { detail: { id: t.id } }));
  }

  onMount(() => {
    const handler = () => searchInputRef?.focus();
    window.addEventListener('techniques:focus-search', handler);
    return () => window.removeEventListener('techniques:focus-search', handler);
  });
</script>

<div class="flex h-full flex-col">
  {#if chat}
    <button
      type="button"
      onclick={() => window.dispatchEvent(new CustomEvent('chat:open-attack-chain'))}
      class="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20"
    >
      <Zap size={12} /> Attack Chain
    </button>
  {/if}
  <p class="mb-2 px-1 text-[10px] leading-snug text-muted-foreground">
    Click a technique to transform selected text, or type <code class="font-mono">/slug</code> in the composer.
  </p>
  <TechniqueSearchInput value={query} onChange={(v) => (query = v)} inputRef={(el) => (searchInputRef = el)} />
  <div class="mt-2 flex-1 overflow-y-auto cryptex-scroll">
    {#if !query}<TechniqueRecent onClick={handleClick} />{/if}
    <TechniqueGroup label="Transform" items={transform} onClick={handleClick} />
    <TechniqueGroup label="Mutate" items={mutate} onClick={handleClick} />
    <TechniqueGroup label="Classifier" items={classifier} onClick={handleClick} />
    <TechniqueGroup label="Composite" items={composite} onClick={handleClick} />
    <TechniqueGroup label="Mode" items={mode} onClick={handleClick} />
    <TechniqueGroup label="Godmode" items={godmode} onClick={handleClick} />
  </div>
</div>
