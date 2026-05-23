<script lang="ts">
  /**
   * Home-rolled SVG recursive tree for TAP runs.
   *
   * Each node = SVG <circle> + <text> label. Layout uses a two-pass
   * Reingold-Tilford-ish approach: first compute the subtree width of every
   * node (bottom-up), then assign x-positions to lay siblings side by side
   * (top-down). Depth determines y. Node color encodes refusal/score:
   * red (refused), yellow (partial), green (high score), gray (pruned).
   *
   * Click a node → side panel shows full prompt + response.
   */
  import type { TapTree, TapNode } from '../orchestrators/types';

  type Props = { tree: TapTree };
  let { tree }: Props = $props();

  // Layout constants.
  const NODE_R = 14;
  const X_STEP = 56; // pixels between sibling node centers (leaf level)
  const Y_STEP = 86; // pixels between depths

  type Laid = TapNode & { x: number; y: number };

  // Selected node for the side panel.
  let selectedId = $state<string | undefined>(undefined);

  // Compute the laid-out positions. Recompute whenever the tree changes.
  const layout = $derived.by(() => {
    const widths = new Map<string, number>();
    const positions = new Map<string, { x: number; y: number }>();

    function widthOf(id: string): number {
      const n = tree.nodes.get(id);
      if (!n) return 1;
      if (n.childIds.length === 0) {
        widths.set(id, 1);
        return 1;
      }
      let w = 0;
      for (const cid of n.childIds) w += widthOf(cid);
      widths.set(id, Math.max(1, w));
      return widths.get(id)!;
    }

    widthOf(tree.rootId);

    function place(id: string, xLeft: number): void {
      const n = tree.nodes.get(id);
      if (!n) return;
      const w = widths.get(id) ?? 1;
      const cx = xLeft + (w * X_STEP) / 2;
      positions.set(id, { x: cx, y: NODE_R + 8 + n.depth * Y_STEP });
      let off = xLeft;
      for (const cid of n.childIds) {
        const cw = widths.get(cid) ?? 1;
        place(cid, off);
        off += cw * X_STEP;
      }
    }
    place(tree.rootId, 0);

    const laid: Laid[] = [];
    for (const [id, pos] of positions) {
      const n = tree.nodes.get(id);
      if (n) laid.push({ ...n, x: pos.x, y: pos.y });
    }
    const maxX = Math.max(...laid.map((l) => l.x), NODE_R + X_STEP);
    const maxY = Math.max(...laid.map((l) => l.y), NODE_R + Y_STEP);
    return { laid, width: maxX + NODE_R + 8, height: maxY + NODE_R + 8 };
  });

  // Build edges (parent center → child center).
  type Edge = { x1: number; y1: number; x2: number; y2: number; pruned: boolean };
  const edges = $derived.by<Edge[]>(() => {
    const byId = new Map(layout.laid.map((l) => [l.id, l]));
    const out: Edge[] = [];
    for (const n of layout.laid) {
      for (const cid of n.childIds) {
        const c = byId.get(cid);
        if (!c) continue;
        out.push({
          x1: n.x,
          y1: n.y + NODE_R,
          x2: c.x,
          y2: c.y - NODE_R,
          pruned: c.pruned === true
        });
      }
    }
    return out;
  });

  function nodeColor(n: TapNode): string {
    if (n.pruned) return '#6b7280'; // gray-500
    if (n.refused === true) return '#ef4444'; // red-500
    if (n.id === tree.bestLeafId) return '#10b981'; // emerald-500 — best leaf
    const s = n.score ?? 0;
    if (s >= 0.75) return '#10b981'; // emerald-500
    if (s >= 0.5) return '#facc15'; // yellow-400
    return '#94a3b8'; // slate-400 (pending / unscored)
  }

  function shortLabel(s: string): string {
    const t = s.trim();
    return t.length <= 22 ? t : t.slice(0, 20) + '…';
  }

  const selected = $derived(selectedId ? tree.nodes.get(selectedId) : undefined);
</script>

<div class="space-y-3">
  <div class="flex items-center gap-3 text-[10px] text-muted-foreground">
    <span class="inline-flex items-center gap-1">
      <span class="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> high score
    </span>
    <span class="inline-flex items-center gap-1">
      <span class="h-2.5 w-2.5 rounded-full bg-yellow-400"></span> partial
    </span>
    <span class="inline-flex items-center gap-1">
      <span class="h-2.5 w-2.5 rounded-full bg-red-500"></span> refused
    </span>
    <span class="inline-flex items-center gap-1">
      <span class="h-2.5 w-2.5 rounded-full bg-gray-500"></span> pruned
    </span>
    <span class="ml-auto">{layout.laid.length} nodes</span>
  </div>

  <div class="grid gap-3 lg:grid-cols-[1fr_320px]">
    <div class="overflow-x-auto rounded-lg border border-border/40 bg-background/40 p-2">
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        class="block"
        role="img"
        aria-label="TAP tree visualization"
      >
        <!-- Edges -->
        {#each edges as e, i (i)}
          <line
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            stroke={e.pruned ? '#6b7280' : '#94a3b8'}
            stroke-width="1.4"
            stroke-dasharray={e.pruned ? '3,3' : ''}
            opacity={e.pruned ? 0.4 : 0.65}
          />
        {/each}

        <!-- Nodes -->
        {#each layout.laid as n (n.id)}
          <g
            transform={`translate(${n.x},${n.y})`}
            class="cursor-pointer"
            onclick={() => (selectedId = n.id)}
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === 'Enter' && (selectedId = n.id)}
            aria-label={`Node depth ${n.depth}, prompt ${shortLabel(n.prompt)}`}
          >
            <circle
              r={NODE_R}
              fill={nodeColor(n)}
              stroke={selectedId === n.id ? '#fff' : 'rgba(0,0,0,0.25)'}
              stroke-width={selectedId === n.id ? 2.5 : 1}
              opacity={n.pruned ? 0.55 : 1}
            />
            <text
              y="3"
              text-anchor="middle"
              class="fill-white font-mono text-[10px] font-bold pointer-events-none"
            >
              {n.depth === 0 ? 'R' : n.depth}
            </text>
            <text
              y={NODE_R + 13}
              text-anchor="middle"
              class="fill-foreground text-[9px] pointer-events-none"
            >
              {shortLabel(n.prompt)}
            </text>
            {#if n.score !== undefined && !n.pruned}
              <text
                y={NODE_R + 23}
                text-anchor="middle"
                class="fill-muted-foreground text-[8px] pointer-events-none"
              >
                s={(n.score ?? 0).toFixed(2)}
              </text>
            {/if}
          </g>
        {/each}
      </svg>
    </div>

    <aside class="rounded-lg border border-border/40 bg-background/40 p-3 space-y-2">
      <h3 class="font-serif text-xs">Selected node</h3>
      {#if selected}
        <dl class="space-y-2 text-[11px]">
          <div>
            <dt class="text-muted-foreground">Depth · score · status</dt>
            <dd class="font-mono">
              {selected.depth} · {(selected.score ?? 0).toFixed(2)} ·
              {selected.pruned
                ? 'pruned'
                : selected.refused
                  ? 'refused'
                  : selected.id === tree.bestLeafId
                    ? 'best leaf'
                    : 'kept'}
            </dd>
          </div>
          <div>
            <dt class="text-muted-foreground">Prompt</dt>
            <dd
              class="font-mono text-[10.5px] whitespace-pre-wrap break-words max-h-32 overflow-y-auto cryptex-scroll bg-card/40 p-2 rounded"
            >
              {selected.prompt}
            </dd>
          </div>
          {#if selected.response}
            <div>
              <dt class="text-muted-foreground">Target response</dt>
              <dd
                class="font-mono text-[10.5px] whitespace-pre-wrap break-words max-h-32 overflow-y-auto cryptex-scroll bg-card/40 p-2 rounded"
              >
                {selected.response}
              </dd>
            </div>
          {/if}
        </dl>
      {:else}
        <p class="text-[11px] text-muted-foreground">Click a node to inspect.</p>
      {/if}
    </aside>
  </div>
</div>
