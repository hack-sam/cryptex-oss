<script lang="ts">
  /**
   * Cross-tool context bridge — two small affordances that link a tool to the
   * Campaign front door:
   *   - "Send to Campaign →" pushes this tool's current goal (+ target) into
   *     the shared context and navigates to /campaign.
   *   - "Use campaign goal/target" hydrates this tool from the shared context
   *     (only shown when the shared context has something).
   *
   * Both are EXPLICIT user actions — never reactive. Tools opt in by dropping
   * this component near their goal/target inputs and supplying an onHydrate.
   */
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { sharedContext } from '$lib/stores/context.svelte';
  import { notify } from '$lib/stores/toast.svelte';
  import Rocket from 'lucide-svelte/icons/rocket';
  import ArrowDownToLine from 'lucide-svelte/icons/arrow-down-to-line';

  interface Props {
    /** The tool's current goal / primary input. */
    goal: string;
    /** The tool's current target model id, if it has one. */
    targetModel?: string;
    /** Hydrate callback — receives the shared context to apply into the tool. */
    onHydrate?: (ctx: { goal: string; targetModel: string }) => void;
  }
  let { goal, targetModel, onHydrate }: Props = $props();

  const canHydrate = $derived(
    sharedContext.hasTarget || sharedContext.goal.trim().length > 0
  );

  function sendToCampaign() {
    sharedContext.set({
      goal: goal.trim(),
      ...(targetModel ? { targetModel } : {})
    });
    void goto(base + '/campaign/');
  }

  function useCampaign() {
    onHydrate?.({ goal: sharedContext.goal, targetModel: sharedContext.targetModel });
    notify.success('Loaded campaign goal/target');
  }
</script>

<div class="flex flex-wrap items-center gap-2">
  <button
    type="button"
    onclick={sendToCampaign}
    class="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20"
    title="Send this goal + target to the Campaign front door"
  >
    <Rocket size={11} /> Send to Campaign
  </button>
  {#if canHydrate && onHydrate}
    <button
      type="button"
      onclick={useCampaign}
      class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title="Use the goal + target from the Campaign front door"
    >
      <ArrowDownToLine size={11} /> Use campaign goal/target
    </button>
  {/if}
</div>
