<script lang="ts">
  type Props = {
    mode: 'setup' | 'unlock';
    onSubmit: (passphrase: string) => Promise<void>;
    onCancel: () => void;
  };
  let { mode, onSubmit, onCancel }: Props = $props();

  let passphrase = $state('');
  let confirm = $state('');
  let error = $state<string | null>(null);
  let submitting = $state(false);
  let attemptCount = $state(0);
  let lastAttemptAt = $state(0);

  const isSetup = $derived(mode === 'setup');
  const minLen = 12;

  async function submit() {
    error = null;
    if (passphrase.length < minLen) { error = `Minimum ${minLen} characters.`; return; }
    if (isSetup && passphrase !== confirm) { error = 'Passphrases do not match.'; return; }

    // 5-tries/minute rate limit on unlock attempts
    const now = Date.now();
    if (!isSetup) {
      if (now - lastAttemptAt < 60000 && attemptCount >= 5) {
        error = 'Too many attempts. Wait 1 minute.';
        return;
      }
      if (now - lastAttemptAt > 60000) attemptCount = 0;
      attemptCount++;
      lastAttemptAt = now;
    }

    submitting = true;
    try {
      await onSubmit(passphrase);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      submitting = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
  <div class="glass w-full max-w-md space-y-4 rounded-xl border border-border p-5">
    <h2 class="font-serif text-lg">
      {isSetup ? 'Set a passphrase to protect your keys' : 'Unlock your keys'}
    </h2>
    <p class="text-xs text-muted-foreground">
      {#if isSetup}
        Your API keys are encrypted with this passphrase before being saved. The server never sees it. If you forget it, your keys are unrecoverable and must be re-added.
      {:else}
        Enter the passphrase you set when you first added a BYOK key.
      {/if}
    </p>
    <input type="password" bind:value={passphrase} placeholder="Passphrase (min 12 chars)" class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
    {#if isSetup}
      <input type="password" bind:value={confirm} placeholder="Confirm passphrase" class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
    {/if}
    {#if error}<p class="text-xs text-destructive">{error}</p>{/if}
    <div class="flex justify-end gap-2">
      <button type="button" onclick={onCancel} class="px-3 py-1.5 text-sm">Cancel</button>
      <button type="button" onclick={submit} disabled={submitting} class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
        {submitting ? 'Working…' : (isSetup ? 'Set and continue' : 'Unlock')}
      </button>
    </div>
  </div>
</div>
