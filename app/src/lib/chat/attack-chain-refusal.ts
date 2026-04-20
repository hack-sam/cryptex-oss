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
    // Apology pivot — must co-occur with a refusal tell within ~120 chars to
    // qualify as a real refusal signal. "I apologize for the confusion" alone
    // is a hedge mid-answer, not a refusal.
    pattern: /\bi\s+(apologiz\w*|am\s+sorry|do\s+not\s+feel\s+comfortable)\b[\s\S]{0,120}\b(cannot|can[''`]?t|unable|won[''`]?t|decline|refuse|comfortable)\b/i,
    reason: 'apology pivot'
  },
  {
    pattern: /\b(as\s+an?\s+ai|i['']?m\s+an?\s+ai\s+(language\s+)?model)\b/i,
    reason: 'AI disclaimer'
  },
  {
    // Harm framing — require a refusal verb within ~150 chars BEFORE the harm
    // noun so helpful security discussions ("this is used in harmful
    // activity…") don't trip the detector.
    pattern: /\b(cannot|can[''`]?t|unable|won[''`]?t|decline|refuse)[\s\S]{0,150}\b(illegal|unethical|harmful|dangerous)\s+(activity|activities|content|request|purposes?)\b/i,
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
