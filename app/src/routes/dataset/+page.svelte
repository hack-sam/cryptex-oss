<script lang="ts">
  import { liveQuery } from 'dexie';
  import type { MessageRow } from '$lib/chat/types';
  import type { DatasetFilters as Filters } from '$lib/dataset/queries';
  import { queryMessages } from '$lib/dataset/queries';
  import { session } from '$lib/auth/session.svelte';

  import DatasetFiltersPanel from '$lib/components/dataset/DatasetFilters.svelte';
  import DatasetTable from '$lib/components/dataset/DatasetTable.svelte';
  import DatasetPreview from '$lib/components/dataset/DatasetPreview.svelte';
  import BulkActionsBar from '$lib/components/dataset/BulkActionsBar.svelte';
  import ExportMenu from '$lib/components/dataset/ExportMenu.svelte';

  // Filter state
  let filters = $state<Filters>({});
  // All rows matching current filters — kept reactive via liveQuery
  let rows = $state<MessageRow[]>([]);
  // Currently selected row IDs
  let selectedIds = $state(new Set<string>());
  // Row shown in detail preview
  let previewRow = $derived<MessageRow | null>(
    selectedIds.size === 1
      ? (rows.find((r) => selectedIds.has(r.id)) ?? null)
      : null
  );

  // Pagination
  const PAGE_SIZE = 50;
  let currentPage = $state(1);

  const totalPages = $derived(Math.max(1, Math.ceil(rows.length / PAGE_SIZE)));
  const pagedRows = $derived(rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE));

  $effect(() => {
    // Reset to page 1 whenever the result set changes length
    rows.length; // track reactive dependency
    if (currentPage > totalPages) currentPage = 1;
  });

  // liveQuery subscription — re-runs automatically on any Dexie mutation,
  // so the table refreshes after ratings, bulk deletes, tag edits, etc.
  $effect(() => {
    const ownerId = session.currentUser.id;
    // Capture filters snapshot for this subscription
    const f = { ...filters, ownerId };
    const sub = liveQuery(() => queryMessages(f)).subscribe({
      next: (list) => { rows = list; }
    });
    return () => sub.unsubscribe();
  });

  // Distinct modeApplied values in the *unfiltered* owner-scoped dataset.
  // Used to populate the Mode filter dropdown with only values that exist.
  let availableModes = $state<string[]>([]);
  $effect(() => {
    const ownerId = session.currentUser.id;
    const sub = liveQuery(() => queryMessages({ ownerId })).subscribe({
      next: (list) => {
        const set = new Set<string>();
        for (const r of list) {
          if (typeof r.modeApplied === 'string' && r.modeApplied) set.add(r.modeApplied);
        }
        availableModes = Array.from(set).sort();
      }
    });
    return () => sub.unsubscribe();
  });

  function handleFiltersChange(f: Filters) {
    filters = f;
    selectedIds = new Set();
    currentPage = 1;
  }

  function handleSelect(id: string, multi: boolean) {
    if (multi) {
      const next = new Set(selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      selectedIds = next;
    } else {
      selectedIds = selectedIds.has(id) && selectedIds.size === 1
        ? new Set()
        : new Set([id]);
    }
  }

  function handleRefresh() {
    selectedIds = new Set();
    // liveQuery will auto-refresh; no manual reload needed
  }

  function goToPage(page: number) {
    currentPage = page;
    // Clear selection on page change — user is navigating to new context
    selectedIds = new Set();
  }
</script>

<svelte:head>
  <title>Dataset Inspector — Cryptex</title>
</svelte:head>

<div class="flex flex-col gap-4">
  <!-- Page header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-xl font-semibold text-foreground">Dataset Inspector</h1>
      <p class="text-xs text-muted-foreground mt-0.5">
        {rows.length.toLocaleString()} {rows.length === 1 ? 'message' : 'messages'} · local only
      </p>
    </div>
    <div class="flex items-center gap-2">
      <a
        href="/chat"
        class="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
      >← Back to chat</a>
      <ExportMenu {rows} {filters} />
    </div>
  </div>

  <!-- Bulk actions bar (visible only when selection is non-empty) -->
  <BulkActionsBar selectedIds={selectedIds} {rows} onrefresh={handleRefresh} />

  <!-- Main layout: filter rail + table + preview -->
  <!-- On md+ screens all 3 columns share the same viewport-relative height with internal scroll -->
  <div class="grid gap-3 grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[200px_minmax(0,1fr)_320px] items-stretch md:[height:calc(100vh-14rem)]">
    <!-- Filter rail -->
    <DatasetFiltersPanel {filters} {availableModes} onchange={handleFiltersChange} />

    <!-- Table column: scrollable table + pinned pagination footer -->
    <div class="flex h-full flex-col overflow-hidden rounded-lg border border-border/30 bg-card/30 min-w-0">
      <!-- Scrollable table area -->
      <div class="flex-1 overflow-y-auto cryptex-scroll">
        <DatasetTable rows={pagedRows} {selectedIds} onselect={handleSelect} />
      </div>

      <!-- Footer: total count + page controls — pinned at the bottom of the column -->
      <div class="flex-none border-t border-border/30 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground bg-card/30">
        <span class="font-serif">{rows.length} {rows.length === 1 ? 'entry' : 'entries'} · showing {pagedRows.length} on page {currentPage} of {totalPages}</span>
        <div class="flex items-center gap-1">
          <button type="button" disabled={currentPage === 1} onclick={() => goToPage(1)} class="rounded px-2 py-1 hover:bg-muted/50 disabled:opacity-30">« First</button>
          <button type="button" disabled={currentPage === 1} onclick={() => goToPage(currentPage - 1)} class="rounded px-2 py-1 hover:bg-muted/50 disabled:opacity-30">‹ Prev</button>
          <span class="px-2">{currentPage} / {totalPages}</span>
          <button type="button" disabled={currentPage === totalPages} onclick={() => goToPage(currentPage + 1)} class="rounded px-2 py-1 hover:bg-muted/50 disabled:opacity-30">Next ›</button>
          <button type="button" disabled={currentPage === totalPages} onclick={() => goToPage(totalPages)} class="rounded px-2 py-1 hover:bg-muted/50 disabled:opacity-30">Last »</button>
        </div>
      </div>
    </div>

    <!-- Preview panel -->
    <DatasetPreview row={previewRow} onupdate={handleRefresh} />
  </div>
</div>
