<script lang="ts">
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import DecodeTool from '$lib/components/tools/decode/DecodeTool.svelte';
</script>

<ToolShell
  toolId="decode"
  title="Universal decoder"
  accent="decoder"
  description="Paste any suspicious-looking text — ciphertext, Base64, binary, Unicode-abused strings, emoji steganography. The decoder runs every transformer's detector, ranks candidates by priority, and surfaces alternatives. Single-layer encodings are reversible primitives, effective as composable layers rather than standalone frontier bypasses."
  usage={{
    title: 'Universal decoder · Usage',
    bullets: [
      'Paste suspicious-looking text — Base64, ROT, binary, emoji, ZWSP.',
      'Auto-debounced 180ms after typing stops.',
      'Click an alternative to view it in the result pane.',
      'Re-decode chains the result back into the input for layered ciphers.',
      '1 MB hard cap — anything larger is rejected.'
    ]
  }}
>
  <DecodeTool />
</ToolShell>
