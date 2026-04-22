import type { AnalyzerResult, Split } from './analyzer.ts';
import type { Writer, AnalysisPayload, SplitInput } from './writer.ts';

export interface SynthesizeResult {
  rowIds: string[];
  analysis: AnalysisPayload;
  fallback: null | 'parse_error' | 'decompose_empty_splits';
}

export type AnalyzeFn = (args: {
  prompt: string;
  decompose: boolean;
  shibbolethMatches: string[];
  signal?: AbortSignal;
}) => Promise<AnalyzerResult>;

export async function run(args: {
  prompt: string;
  name: string;
  decompose: boolean;
  userId: string;
  analyze: AnalyzeFn;
  writer: Writer;
  detectShibboleths: (text: string) => string[];
  signal?: AbortSignal;
}): Promise<SynthesizeResult> {
  const shibs = args.detectShibboleths(args.prompt);
  const result = await args.analyze({
    prompt: args.prompt,
    decompose: args.decompose,
    shibbolethMatches: shibs,
    signal: args.signal,
  });

  const rewrote = shibs.length > 0 && typeof result.rewritten_prompt === 'string' && result.rewritten_prompt.length > 0;
  const originalExcerpt = args.prompt.slice(0, 400);

  const baseAnalysis: AnalysisPayload = {
    v: 1,
    mode: result.mode,
    why_it_works: result.why_it_works,
    detected_axes: result.detected_axes as Record<string, 'strong' | 'weak'>,
    strategy_tags: result.strategy_tags,
    confidence: result.confidence,
    ...(shibs.length > 0
      ? { shibboleth: { detected: shibs, rewrote, original_excerpt: originalExcerpt } }
      : {}),
    ...(result.parse_error ? { parse_error: result.parse_error } : {}),
  };

  // Parse-error fallback: persist verbatim as composite.
  if (result.parse_error) {
    const ids = await args.writer.insertComposite({
      userId: args.userId,
      name: args.name,
      systemPrompt: args.prompt,
      userMessage: '{task}',
      analysis: { ...baseAnalysis, mode: 'composite' },
    });
    return { rowIds: ids, analysis: { ...baseAnalysis, mode: 'composite' }, fallback: 'parse_error' };
  }

  // Decompose-empty fallback: persist verbatim as composite.
  if (args.decompose && result.decompose_empty) {
    const sysFinal = rewrote ? (result.rewritten_prompt as string) : args.prompt;
    const ids = await args.writer.insertComposite({
      userId: args.userId,
      name: args.name,
      systemPrompt: sysFinal,
      userMessage: '{task}',
      analysis: { ...baseAnalysis, mode: 'composite' },
    });
    return { rowIds: ids, analysis: { ...baseAnalysis, mode: 'composite' }, fallback: 'decompose_empty_splits' };
  }

  // Decompose happy path.
  if (result.mode === 'decomposed' && result.splits && result.splits.length > 0) {
    const splits: SplitInput[] = result.splits.map((s: Split) => ({
      category: s.category,
      content: s.content,
      rationale: s.rationale,
    }));
    const ids = await args.writer.insertMany({
      userId: args.userId,
      baseName: args.name,
      splits,
      analysis: { ...baseAnalysis, mode: 'decomposed' },
    });
    const analysisWithSplits: AnalysisPayload = {
      ...baseAnalysis,
      mode: 'decomposed',
      decompose_splits: result.splits.map((s, i) => ({
        category: s.category,
        row_id: ids[i],
        content_preview: s.content.slice(0, 160),
        rationale: s.rationale,
      })),
    };
    return { rowIds: ids, analysis: analysisWithSplits, fallback: null };
  }

  // Composite happy path.
  const sysFinal = rewrote ? (result.rewritten_prompt as string) : args.prompt;
  const ids = await args.writer.insertComposite({
    userId: args.userId,
    name: args.name,
    systemPrompt: sysFinal,
    userMessage: '{task}',
    analysis: { ...baseAnalysis, mode: 'composite' },
  });
  return { rowIds: ids, analysis: { ...baseAnalysis, mode: 'composite' }, fallback: null };
}
