<script lang="ts">
  import ToolShell from '$lib/components/shell/ToolShell.svelte';
  import TransformTool from '$lib/components/tools/transform/TransformTool.svelte';
  import { transformers } from '$lib/transformers/registry';

  const transformCount = Object.keys(transformers).length;
</script>

<ToolShell
  toolId="transforms"
  title="Transform lab"
  accent="lab"
  description={`${transformCount} transforms — encodings, classical & modern ciphers, Unicode styles, ancient scripts, and steganography. Pick any tile to encode or decode the text on the left. Single-layer ciphers, encodings, and ancient scripts are reversible primitives: effective as layers (cipher-stack, base64-smuggle, composites), not standalone frontier bypasses.`}
  usage={{
    title: 'Transform lab · Usage',
    bullets: [
      'Pick a category or search for a transform by name.',
      'Encode/Decode toggles direction; greyed out if not reversible.',
      'Star a transform to pin it to Favorites.',
      'Some transforms have options — they expand below the tile.',
      'Inputs above 50 KB run in a Web Worker; 1 MB hard cap.'
    ]
  }}
>
  <TransformTool />
</ToolShell>
