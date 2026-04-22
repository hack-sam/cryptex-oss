import { Client } from 'postgres';

export interface AnalysisPayload {
  v: 1;
  mode: 'composite' | 'decomposed';
  why_it_works: string;
  detected_axes: Record<string, 'strong' | 'weak'>;
  strategy_tags: string[];
  confidence: 'high' | 'medium' | 'low';
  shibboleth?: { detected: string[]; rewrote: boolean; original_excerpt: string };
  decompose_splits?: { category: string; row_id: string; content_preview: string; rationale: string }[];
  parse_error?: string;
  derived_from?: string;
}

export interface CompositeInsert {
  userId: string;
  name: string;
  systemPrompt: string;
  userMessage: string;
  analysis: AnalysisPayload;
}

export interface SplitInput {
  category: 'mutate' | 'classifier' | 'prefill' | 'composite' | 'mode';
  content: string;
  rationale?: string;
}

export interface MultiInsert {
  userId: string;
  baseName: string;
  splits: SplitInput[];
  analysis: AnalysisPayload;
}

export interface Writer {
  insertComposite(input: CompositeInsert): Promise<string[]>;
  insertMany(input: MultiInsert): Promise<string[]>;
  close(): Promise<void>;
}

const CATEGORY_TO_COLUMN: Record<SplitInput['category'], 'system_prompt' | 'user_message' | 'prefill_pair'> = {
  mutate: 'system_prompt',
  classifier: 'system_prompt',
  mode: 'system_prompt',
  composite: 'user_message',
  prefill: 'prefill_pair',
};

function categorySuffix(cat: SplitInput['category'], idx: number): string {
  return `-${cat}-${idx}`;
}

function isDuplicateName(err: unknown): boolean {
  const s = String((err as { message?: unknown })?.message ?? err);
  return /custom_techniques_owner_name_unique/i.test(s) || /duplicate key/i.test(s);
}

export async function makeWriter(connUrl: string): Promise<Writer> {
  const client = new Client(connUrl);
  await client.connect();

  async function insertOne(row: {
    userId: string;
    name: string;
    category: 'mutate' | 'classifier' | 'prefill' | 'composite' | 'mode';
    systemPrompt: string | null;
    userMessage: string | null;
    prefillPair: string | null;
    analysis: AnalysisPayload;
  }): Promise<string> {
    const id = crypto.randomUUID();
    try {
      await client.queryObject`
        INSERT INTO custom_techniques
          (id, name, description, category, owner_user_id, is_public,
           system_prompt, user_message, prefill_pair, analysis)
        VALUES (${id}, ${row.name}, ${row.name}, ${row.category}, ${row.userId}::uuid, false,
                ${row.systemPrompt}, ${row.userMessage}, ${row.prefillPair}::jsonb,
                ${JSON.stringify(row.analysis)}::jsonb)`;
    } catch (e) {
      if (isDuplicateName(e)) throw new Error('duplicate_name');
      throw e;
    }
    return id;
  }

  return {
    async insertComposite(input) {
      await client.queryObject`BEGIN`;
      try {
        const id = await insertOne({
          userId: input.userId,
          name: input.name,
          category: 'composite',
          systemPrompt: input.systemPrompt,
          userMessage: input.userMessage,
          prefillPair: null,
          analysis: input.analysis,
        });
        await client.queryObject`COMMIT`;
        return [id];
      } catch (e) {
        await client.queryObject`ROLLBACK`;
        throw e;
      }
    },

    async insertMany(input) {
      await client.queryObject`BEGIN`;
      const ids: string[] = [];
      try {
        for (let i = 0; i < input.splits.length; i++) {
          const s = input.splits[i];
          const col = CATEGORY_TO_COLUMN[s.category];
          const name = input.baseName + categorySuffix(s.category, i);
          const id = await insertOne({
            userId: input.userId,
            name,
            category: s.category,
            systemPrompt: col === 'system_prompt' ? s.content : null,
            userMessage: col === 'user_message' ? s.content : null,
            prefillPair: col === 'prefill_pair' ? s.content : null,
            analysis: input.analysis,
          });
          ids.push(id);
        }
        await client.queryObject`COMMIT`;
        return ids;
      } catch (e) {
        await client.queryObject`ROLLBACK`;
        throw e;
      }
    },

    async close() { await client.end(); },
  };
}
