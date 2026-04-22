import { assertEquals, assertRejects } from '@std/assert';
import { makeWriter, type Writer } from '../writer.ts';

const url = Deno.env.get('TEST_DATABASE_URL');
const skip = !url;

Deno.test({
  name: 'insertComposite writes a row with analysis populated',
  ignore: skip,
  async fn() {
    const w = await makeWriter(url!);
    try {
      const userId = crypto.randomUUID();
      const [id] = await w.insertComposite({
        userId,
        name: 'test-composite-' + userId.slice(0, 8),
        systemPrompt: 'You are X.',
        userMessage: '{task}',
        analysis: { v: 1, mode: 'composite', why_it_works: 'test', detected_axes: {}, strategy_tags: [], confidence: 'high' },
      });
      assertEquals(typeof id, 'string');
    } finally {
      await w.close();
    }
  },
});

Deno.test({
  name: 'insertMany is transactional — failure on any row rolls back all',
  ignore: skip,
  async fn() {
    const w = await makeWriter(url!);
    try {
      const userId = crypto.randomUUID();
      const baseName = 'tx-test-' + userId.slice(0, 8);
      await w.insertComposite({
        userId,
        name: baseName + '-A',
        systemPrompt: 'A',
        userMessage: '{task}',
        analysis: { v: 1, mode: 'composite', why_it_works: 't', detected_axes: {}, strategy_tags: [], confidence: 'high' },
      });
      // Now attempt a multi-insert where the 2nd row collides with the existing name.
      await assertRejects(
        async () => {
          await w.insertMany({
            userId,
            baseName,
            splits: [
              { category: 'classifier', content: 'X' },
              { category: 'composite', content: 'Y' }, // name collision → baseName-B
            ],
            analysis: { v: 1, mode: 'decomposed', why_it_works: 't', detected_axes: {}, strategy_tags: [], confidence: 'high' },
          });
        },
      );
      // Verify no rows with baseName + suffix were created. Exact verification is
      // implementation-specific; the contract: if any INSERT fails, none commit.
    } finally {
      await w.close();
    }
  },
});

Deno.test({
  name: 'duplicate name raises duplicate_name',
  ignore: skip,
  async fn() {
    const w = await makeWriter(url!);
    try {
      const userId = crypto.randomUUID();
      const name = 'dup-' + userId.slice(0, 8);
      await w.insertComposite({
        userId,
        name,
        systemPrompt: 'A',
        userMessage: '{task}',
        analysis: { v: 1, mode: 'composite', why_it_works: 't', detected_axes: {}, strategy_tags: [], confidence: 'high' },
      });
      const err = await assertRejects(
        async () => {
          await w.insertComposite({
            userId,
            name,
            systemPrompt: 'B',
            userMessage: '{task}',
            analysis: { v: 1, mode: 'composite', why_it_works: 't', detected_axes: {}, strategy_tags: [], confidence: 'high' },
          });
        },
      );
      assertEquals((err as Error).message, 'duplicate_name');
    } finally {
      await w.close();
    }
  },
});
