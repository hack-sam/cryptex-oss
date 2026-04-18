<script lang="ts">
  import Brain from 'lucide-svelte/icons/brain';
  import Eye from 'lucide-svelte/icons/eye';
  import Wrench from 'lucide-svelte/icons/wrench';
  import File from 'lucide-svelte/icons/file';
  import Braces from 'lucide-svelte/icons/braces';
  import Gift from 'lucide-svelte/icons/gift';

  type Kind = 'reasoning' | 'vision' | 'tools' | 'pdf' | 'jsonSchema' | 'free';
  type Props = { kind: Kind };
  let { kind }: Props = $props();
</script>

{#if kind === 'reasoning'}<Brain class="h-3 w-3" aria-label="reasoning" />
{:else if kind === 'vision'}<Eye class="h-3 w-3" aria-label="vision" />
{:else if kind === 'tools'}<Wrench class="h-3 w-3" aria-label="tools" />
{:else if kind === 'pdf'}<File class="h-3 w-3" aria-label="pdf" />
{:else if kind === 'jsonSchema'}<Braces class="h-3 w-3" aria-label="json schema" />
{:else if kind === 'free'}<Gift class="h-3 w-3" aria-label="free tier" />
{/if}
