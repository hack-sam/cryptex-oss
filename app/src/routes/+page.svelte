<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';

  onMount(() => {
    // v2.6: the Campaign front door is the home landing page (toolbox -> pipeline).
    goto(base + '/campaign/', { replaceState: true });
  });
</script>

<div class="flex min-h-[50vh] items-center justify-center text-muted-foreground">
  <span class="animate-pulse">Entering the lab…</span>
</div>
