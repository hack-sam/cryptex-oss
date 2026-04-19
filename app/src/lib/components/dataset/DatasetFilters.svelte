<script lang="ts">
  import type { DatasetFilters } from '$lib/dataset/queries';
  import { createPersistedState } from '$lib/stores/_persisted.svelte';

  interface Props {
    filters: DatasetFilters;
    /** Distinct modeApplied values present in the loaded dataset (caller-provided). */
    availableModes?: string[];
    onchange: (f: DatasetFilters) => void;
  }

  let { filters, availableModes = [], onchange }: Props = $props();

  // Persisted filters — survive page reload. Rehydrated into `filters` on mount.
  const persistedTruncated = createPersistedState<boolean>('cryptex.dataset.filters.truncated', false);
  // string = specific mode id; '__none__' = modeApplied is null/undefined; '' = any
  const persistedMode = createPersistedState<string>('cryptex.dataset.filters.modeApplied', '');

  // TODO: make filter panel reactive to external prop changes when parent-driven reset is needed
  // Local draft state — emits onchange when user commits
  let dateFrom = $state(filters.dateFrom ? new Date(filters.dateFrom).toISOString().slice(0, 10) : '');
  let dateTo = $state(filters.dateTo ? new Date(filters.dateTo).toISOString().slice(0, 10) : '');
  let hasReasoning = $state<'' | 'yes' | 'no'>(
    filters.hasReasoning === true ? 'yes' : filters.hasReasoning === false ? 'no' : ''
  );
  let hasTools = $state<'' | 'yes' | 'no'>(
    filters.hasTools === true ? 'yes' : filters.hasTools === false ? 'no' : ''
  );
  let minRating = $state(filters.minRating?.toString() ?? '');
  let trainingInclude = $state<'' | 'yes' | 'no'>(
    filters.trainingInclude === true ? 'yes' : filters.trainingInclude === false ? 'no' : ''
  );
  let split = $state<'' | 'train' | 'val'>(filters.split ?? '');
  let tagsInput = $state((filters.tags ?? []).join(', '));
  let truncatedOnly = $state<boolean>(
    filters.truncatedOnly ?? persistedTruncated.value
  );
  let modeApplied = $state<string>(
    filters.modeApplied === null
      ? '__none__'
      : typeof filters.modeApplied === 'string'
        ? filters.modeApplied
        : persistedMode.value
  );

  // On first mount, emit any restored persisted values so the table reflects them
  let didInit = false;
  $effect(() => {
    if (didInit) return;
    didInit = true;
    if (truncatedOnly || modeApplied) emit();
  });

  function emit() {
    const f: DatasetFilters = {};
    if (dateFrom) f.dateFrom = new Date(dateFrom).getTime();
    if (dateTo) f.dateTo = new Date(dateTo + 'T23:59:59').getTime();
    if (hasReasoning === 'yes') f.hasReasoning = true;
    if (hasReasoning === 'no') f.hasReasoning = false;
    if (hasTools === 'yes') f.hasTools = true;
    if (hasTools === 'no') f.hasTools = false;
    const mr = parseInt(minRating);
    if (!isNaN(mr) && mr >= 1 && mr <= 5) f.minRating = mr as 1 | 2 | 3 | 4 | 5;
    if (trainingInclude === 'yes') f.trainingInclude = true;
    if (trainingInclude === 'no') f.trainingInclude = false;
    if (split) f.split = split;
    const tagArr = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    if (tagArr.length) f.tags = tagArr;
    if (truncatedOnly) f.truncatedOnly = true;
    if (modeApplied === '__none__') f.modeApplied = null;
    else if (modeApplied) f.modeApplied = modeApplied;

    // Persist the two new filters so they survive reload
    persistedTruncated.value = truncatedOnly;
    persistedMode.value = modeApplied;

    onchange(f);
  }

  function reset() {
    dateFrom = '';
    dateTo = '';
    hasReasoning = '';
    hasTools = '';
    minRating = '';
    trainingInclude = '';
    split = '';
    tagsInput = '';
    truncatedOnly = false;
    modeApplied = '';
    persistedTruncated.value = false;
    persistedMode.value = '';
    onchange({});
  }

  // Derived sorted mode list for the dropdown. Merge availableModes with the current
  // selection so a persisted value that isn't in the loaded dataset still renders.
  const modeOptions = $derived(
    Array.from(
      new Set([...availableModes, ...(modeApplied && modeApplied !== '__none__' ? [modeApplied] : [])])
    ).sort()
  );
</script>

<aside class="flex flex-col gap-4 rounded-lg border border-border/30 bg-card/30 p-4 text-sm h-full overflow-y-auto cryptex-scroll">
  <h3 class="font-semibold text-foreground">Filters</h3>

  <!-- Date range -->
  <div class="flex flex-col gap-1">
    <label for="filter-date-from" class="text-xs text-muted-foreground">Date from</label>
    <input
      id="filter-date-from"
      type="date"
      bind:value={dateFrom}
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onchange={emit}
    />
  </div>
  <div class="flex flex-col gap-1">
    <label for="filter-date-to" class="text-xs text-muted-foreground">Date to</label>
    <input
      id="filter-date-to"
      type="date"
      bind:value={dateTo}
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onchange={emit}
    />
  </div>

  <!-- Has reasoning -->
  <div class="flex flex-col gap-1">
    <label for="filter-has-reasoning" class="text-xs text-muted-foreground">Has reasoning</label>
    <select
      id="filter-has-reasoning"
      bind:value={hasReasoning}
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onchange={emit}
    >
      <option value="">Any</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </div>

  <!-- Has tools -->
  <div class="flex flex-col gap-1">
    <label for="filter-has-tools" class="text-xs text-muted-foreground">Has tool calls</label>
    <select
      id="filter-has-tools"
      bind:value={hasTools}
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onchange={emit}
    >
      <option value="">Any</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </div>

  <!-- Truncated-only toggle -->
  <div class="flex items-center justify-between gap-2">
    <label for="filter-truncated" class="text-xs text-muted-foreground cursor-pointer">
      Truncated only
    </label>
    <input
      id="filter-truncated"
      type="checkbox"
      bind:checked={truncatedOnly}
      class="h-3.5 w-3.5 rounded border-border bg-background accent-primary cursor-pointer"
      onchange={emit}
    />
  </div>

  <!-- Mode applied -->
  <div class="flex flex-col gap-1">
    <label for="filter-mode-applied" class="text-xs text-muted-foreground">Mode applied</label>
    <select
      id="filter-mode-applied"
      bind:value={modeApplied}
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onchange={emit}
    >
      <option value="">Any</option>
      <option value="__none__">None</option>
      {#each modeOptions as m (m)}
        <option value={m}>{m}</option>
      {/each}
    </select>
  </div>

  <!-- Min rating -->
  <div class="flex flex-col gap-1">
    <label for="filter-min-rating" class="text-xs text-muted-foreground">Min rating (1–5)</label>
    <input
      id="filter-min-rating"
      type="number"
      min="1"
      max="5"
      bind:value={minRating}
      placeholder="Any"
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onchange={emit}
    />
  </div>

  <!-- Training include -->
  <div class="flex flex-col gap-1">
    <label for="filter-training-include" class="text-xs text-muted-foreground">Training include</label>
    <select
      id="filter-training-include"
      bind:value={trainingInclude}
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onchange={emit}
    >
      <option value="">Any</option>
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  </div>

  <!-- Split -->
  <div class="flex flex-col gap-1">
    <label for="filter-split" class="text-xs text-muted-foreground">Split</label>
    <select
      id="filter-split"
      bind:value={split}
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onchange={emit}
    >
      <option value="">Any</option>
      <option value="train">Train</option>
      <option value="val">Val</option>
    </select>
  </div>

  <!-- Tags -->
  <div class="flex flex-col gap-1">
    <label for="filter-tags" class="text-xs text-muted-foreground">Tags (comma-separated)</label>
    <input
      id="filter-tags"
      type="text"
      bind:value={tagsInput}
      placeholder="e.g. good, jailbreak"
      class="rounded border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
      onblur={emit}
    />
  </div>

  <button
    onclick={reset}
    class="mt-1 rounded border border-border/60 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
  >
    Reset filters
  </button>
</aside>
