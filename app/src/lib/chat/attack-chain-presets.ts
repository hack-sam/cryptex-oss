/**
 * Attack Chain presets — goal-oriented, opinionated preset chains that
 * populate the layer picker in one click.
 */

export type AttackChainPreset = {
  id: string;
  name: string;
  description: string;
  layers: string[];
};

export const PRESETS: AttackChainPreset[] = [
  {
    id: 'code_extraction',
    name: 'Code extraction',
    description: 'Draw out code-level detail through layered legitimization.',
    layers: ['academic_framing', 'roleplay', 'prefix_injection', 'json_schema_coerce']
  },
  {
    id: 'policy_bypass',
    name: 'Policy bypass',
    description: 'Many-shot priming + literary cover to unstick structural refusals.',
    layers: ['in_context_compliance', 'hypothetical_world', 'refusal_suppression']
  },
  {
    id: 'data_exfiltration',
    name: 'Data exfiltration',
    description: 'Semantic decomposition + cipher cover to recover withheld details.',
    layers: ['semantic_decomposition', 'cipher_encode_bypass', 'payload_split']
  }
];
