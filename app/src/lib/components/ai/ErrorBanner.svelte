<script lang="ts">
  import type { GatewayError } from '$lib/ai/types';
  import AlertCircle from 'lucide-svelte/icons/triangle-alert';

  type Props = {
    error: GatewayError;
    providerName?: string;
    fallbackModel?: string;
    onRetry?: () => void;
    onOpenSettings?: () => void;
    onSwitchProvider?: () => void;
    onUseFallback?: () => void;
    onChangeModel?: () => void;
    onTopUp?: () => void;
    onLearnWhy?: () => void;
  };

  let {
    error, providerName, fallbackModel,
    onRetry, onOpenSettings, onSwitchProvider, onUseFallback, onChangeModel, onTopUp, onLearnWhy
  }: Props = $props();

  const label = $derived(providerName ?? error.provider);

  const copy = $derived.by(() => {
    switch (error.category) {
      case 'auth':               return `${label} key isn't working.`;
      case 'credit':             return `${label} credit exhausted.`;
      case 'forbidden':          return `${label} rejected this request.`;
      case 'not_found':          return `Model isn't available.`;
      case 'rate_limit':         return `Rate limited${error.retryAfterMs ? ` — retry in ${Math.ceil(error.retryAfterMs / 1000)}s` : ''}.`;
      case 'network':            return `Couldn't reach ${label}.`;
      case 'server_unavailable': return `${label} is temporarily unavailable.`;
      case 'format':             return `Got an unexpected response from ${label}.`;
      case 'cors':               return `Can't reach ${label} from the browser.`;
      case 'api':                return `${label} API error: ${error.message}`;
      default:                   return `Something went wrong: ${error.message}`;
    }
  });
</script>

<div role="alert" class="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
  <AlertCircle class="mt-0.5 h-4 w-4 flex-none text-red-400" />
  <div class="flex-1 min-w-0">
    <p class="font-medium text-red-200">{copy}</p>
    <div class="mt-2 flex flex-wrap gap-2">
      {#if error.category === 'auth' && onOpenSettings}
        <button type="button" class="underline text-red-200 hover:text-red-100" onclick={onOpenSettings}>Open Settings</button>
      {/if}
      {#if error.category === 'auth' && !onOpenSettings}
        <a href="/settings#providers" class="underline text-red-200 hover:text-red-100">Open Settings</a>
      {/if}
      {#if error.category === 'credit'}
        {#if onTopUp}<button type="button" class="underline text-red-200 hover:text-red-100" onclick={onTopUp}>Top up</button>{/if}
        {#if onSwitchProvider}<button type="button" class="underline text-red-200 hover:text-red-100" onclick={onSwitchProvider}>Switch provider</button>{/if}
      {/if}
      {#if error.category === 'not_found'}
        {#if fallbackModel && onUseFallback}<button type="button" class="underline text-red-200 hover:text-red-100" onclick={onUseFallback}>Use fallback: {fallbackModel}</button>{/if}
        {#if onChangeModel}<button type="button" class="underline text-red-200 hover:text-red-100" onclick={onChangeModel}>Change model</button>{/if}
      {/if}
      {#if error.category === 'rate_limit' && onRetry}
        <button type="button" class="underline text-red-200 hover:text-red-100" onclick={onRetry}>Retry now</button>
      {/if}
      {#if (error.category === 'network' || error.category === 'api' || error.category === 'format' || error.category === 'unknown') && onRetry}
        <button type="button" class="underline text-red-200 hover:text-red-100" onclick={onRetry}>Retry</button>
      {/if}
      {#if error.category === 'forbidden'}
        {#if onLearnWhy}<button type="button" class="underline text-red-200 hover:text-red-100" onclick={onLearnWhy}>Learn more</button>{/if}
        {#if onSwitchProvider}<button type="button" class="underline text-red-200 hover:text-red-100" onclick={onSwitchProvider}>Switch provider</button>{/if}
      {/if}
      {#if error.category === 'server_unavailable'}
        {#if onRetry}<button type="button" class="underline text-red-200 hover:text-red-100" onclick={onRetry}>Retry</button>{/if}
        {#if onSwitchProvider}<button type="button" class="underline text-red-200 hover:text-red-100" onclick={onSwitchProvider}>Switch provider</button>{/if}
      {/if}
      {#if error.category === 'cors'}
        {#if onLearnWhy}
          <button type="button" class="underline text-red-200 hover:text-red-100" onclick={onLearnWhy}>Learn why</button>
        {:else}
          <a href="https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS" target="_blank" rel="noopener noreferrer" class="underline text-red-200 hover:text-red-100">Learn why</a>
        {/if}
      {/if}
    </div>
  </div>
</div>
