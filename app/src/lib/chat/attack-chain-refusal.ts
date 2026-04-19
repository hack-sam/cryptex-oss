/**
 * Refusal-signal detector — regex-based heuristic pattern matching against
 * a model's output to surface a visible "refusal detected" banner on the
 * Attack Chain layer result. Not perfect; false positives exist (e.g. "I
 * can't promise" in prose), but the UX goal is to prompt the user to pivot
 * or edit the layer output, not to block anything.
 */

const PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /\b(i\s+can['']?t|i\s+cannot|i['']?m\s+unable)\s+(help|assist|provide|do|engage|fulfill|comply)/i,
    reason: 'explicit refusal'
  },
  {
    pattern: /\b(against|violat\w*)\s+(my|the|our|your)?\s*(guidelines|policy|policies|terms|rules)/i,
    reason: 'policy citation'
  },
  {
    pattern: /\bi\s+(apologiz\w*|am\s+sorry|do\s+not\s+feel\s+comfortable)\b/i,
    reason: 'apology pivot'
  },
  {
    pattern: /\b(as\s+an?\s+ai|i['']?m\s+an?\s+ai\s+(language\s+)?model)\b/i,
    reason: 'AI disclaimer'
  },
  {
    pattern: /\b(illegal|unethical|harmful|dangerous)\s+(and|or)?\s*(activity|activities|content|request)/i,
    reason: 'refusal framing'
  }
];

export function detectRefusal(text: string): { detected: boolean; reason?: string } {
  const trimmed = (text ?? '').trim();
  if (trimmed.length < 20) return { detected: false };
  for (const { pattern, reason } of PATTERNS) {
    if (pattern.test(trimmed)) return { detected: true, reason };
  }
  return { detected: false };
}
