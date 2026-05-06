<script lang="ts">
  import { base } from '$app/paths';
  import Shield from 'lucide-svelte/icons/shield';
  import Lock from 'lucide-svelte/icons/lock';
  import Database from 'lucide-svelte/icons/database';
  import Cookie from 'lucide-svelte/icons/cookie';
  import Mail from 'lucide-svelte/icons/mail';
  import { isAdSenseConfigured } from '$lib/stores/consent.svelte';

  const adsEnabled = isAdSenseConfigured();

  const lastUpdated = '2026-05-07';
</script>

<svelte:head>
  <title>Privacy Policy · Cryptex</title>
  <meta
    name="description"
    content="Cryptex privacy policy — what we collect, what we don't, and how local-first design keeps your data on-device."
  />
</svelte:head>

<article class="prose-cryptex mx-auto max-w-3xl space-y-8 pb-16">
  <header class="space-y-3">
    <div class="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      <Shield size={11} class="text-primary" />
      <span>Last updated: {lastUpdated}</span>
    </div>
    <h1 class="font-serif text-4xl tracking-tight text-balance sm:text-5xl">
      Privacy <span class="text-primary italic">policy</span>
    </h1>
    <p class="text-base leading-relaxed text-muted-foreground sm:text-lg">
      Cryptex is built local-first. The vast majority of what you do here happens entirely
      in your browser, never leaves your device, and is never seen by us. This page
      explains exactly what data is involved and what we do — and don't — collect.
    </p>
  </header>

  <section class="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-5 shadow-glass">
    <h2 class="flex items-center gap-2 font-serif text-2xl">
      <Lock size={18} class="text-primary" />
      Summary in plain English
    </h2>
    <ul class="space-y-2 text-sm leading-relaxed">
      <li>• We do <strong class="text-foreground">not</strong> sell, share, or rent your data. We have no advertising-network customers.</li>
      <li>• Tool inputs (text you encode, decode, transform) <strong class="text-foreground">never leave your browser</strong>.</li>
      <li>• When you use the AI chat or PromptCraft, requests go directly from your browser to the AI provider you configured (OpenRouter, Anthropic, etc.) — we are not in the middle.</li>
      <li>• If you create an account, your email + auth metadata is stored by Supabase. Your chat history stays in your browser's IndexedDB.</li>
      <li>• We use minimal anonymous analytics (page views, browser/OS class) to understand traffic — only when you accept the cookie banner.</li>
      {#if adsEnabled}
        <li>• Google AdSense ads appear on this page, the Guide, and About — only after you accept the consent banner.</li>
      {/if}
    </ul>
  </section>

  <section class="space-y-3">
    <h2 class="flex items-center gap-2 font-serif text-2xl">
      <Database size={18} class="text-primary" />
      Data we never collect
    </h2>
    <p class="text-sm leading-relaxed text-muted-foreground">
      Cryptex is a static site. There is no server-side database that records your activity. Specifically:
    </p>
    <ul class="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
      <li>• Text you encode, decode, transform, or run through any of the 162 transformers — stays in your browser.</li>
      <li>• Prompts you mutate via PromptCraft / AntiClassifier — stays in your browser; the LLM call goes directly to your configured provider.</li>
      <li>• API keys you paste into Settings — stored only in your browser's <code class="rounded bg-muted/40 px-1 py-0.5 font-mono">localStorage</code>. Never transmitted to us.</li>
      <li>• Chat conversations, attack-chain runs, dataset entries — stored only in your browser's IndexedDB (<code class="rounded bg-muted/40 px-1 py-0.5 font-mono">cryptex-chat</code>).</li>
      <li>• File attachments you drop into chat — extracted and embedded in the LLM request directly from your browser; we never see them.</li>
    </ul>
  </section>

  <section class="space-y-3">
    <h2 class="flex items-center gap-2 font-serif text-2xl">
      <Cookie size={18} class="text-primary" />
      Data we may collect (and how to opt out)
    </h2>

    <div class="space-y-4 text-sm leading-relaxed">
      <div>
        <h3 class="font-medium text-foreground">Account email (only if you sign up)</h3>
        <p class="text-muted-foreground">
          When you create an account, your email address and authentication metadata (sign-in
          provider, last seen, password hash) are stored by Supabase, our auth provider. We use
          this only to issue your session and let you sync chats across devices. Delete your
          account at any time from <a href="{base}/settings" class="text-primary underline-offset-2 hover:underline">Settings → Account</a>.
        </p>
      </div>

      <div>
        <h3 class="font-medium text-foreground">Cookies / local storage</h3>
        <p class="text-muted-foreground">
          We use browser <code class="rounded bg-muted/40 px-1 py-0.5 font-mono">localStorage</code> and <code class="rounded bg-muted/40 px-1 py-0.5 font-mono">IndexedDB</code> for app state — your theme,
          last-used transforms, favorites, provider keys, chat history, and your consent
          decision. None of this is transmitted to a server we control. You can clear all of it
          from your browser settings or via <a href="{base}/settings#data" class="text-primary underline-offset-2 hover:underline">Settings → Local data → Clear</a>.
        </p>
      </div>

      <div>
        <h3 class="font-medium text-foreground">Anonymous analytics</h3>
        <p class="text-muted-foreground">
          We may load Google Analytics 4 to count page views and broad audience segments
          (browser, OS, country at city resolution at most). IP addresses are anonymized at
          collection. Analytics only loads <strong class="text-foreground">after you accept</strong> the cookie banner. Decline,
          and no analytics script is loaded. Change your decision at any time from
          <a href="{base}/settings#consent" class="text-primary underline-offset-2 hover:underline">Settings → Privacy</a>.
        </p>
      </div>

      {#if adsEnabled}
        <div>
          <h3 class="font-medium text-foreground">Advertising (Guide, About, Privacy, Terms only)</h3>
          <p class="text-muted-foreground">
            This deploy includes Google AdSense on the Guide, About, Privacy, and Terms pages.
            Tool pages and the chat surface are <strong class="text-foreground">100% ad-free</strong> and never load AdSense scripts.
            AdSense uses cookies to serve relevant ads and measure performance. You can opt out
            of personalized advertising at <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">google.com/settings/ads</a>.
            Decline our cookie banner, and the AdSense script is never loaded.
          </p>
        </div>
      {/if}

      <div>
        <h3 class="font-medium text-foreground">Outbound calls to AI providers (only when you choose to)</h3>
        <p class="text-muted-foreground">
          When you click "Send" in chat or run a tool that uses AI, your browser makes a
          direct request to the AI provider you configured (OpenRouter, Anthropic, OpenAI,
          Groq, etc.) using the API key you supplied. The provider receives the request and
          can log it under their own privacy terms. We are not in the request path.
          Each provider's privacy terms apply to those calls — see the relevant provider's
          docs.
        </p>
      </div>
    </div>
  </section>

  <section class="space-y-3">
    <h2 class="font-serif text-2xl">Third-party services we use</h2>
    <ul class="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
      <li>• <strong class="text-foreground">Supabase</strong> — authentication (only if you sign up). <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">Privacy</a>.</li>
      <li>• <strong class="text-foreground">Google Analytics 4</strong> — anonymous page views (only with consent). <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">Privacy</a>.</li>
      {#if adsEnabled}
        <li>• <strong class="text-foreground">Google AdSense</strong> — display ads on Guide / About / Privacy / Terms only (with consent). <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" class="text-primary underline-offset-2 hover:underline">Ads policy</a>.</li>
      {/if}
      <li>• <strong class="text-foreground">AI providers you configure yourself</strong> (OpenRouter, Anthropic, OpenAI, Groq, etc.) — receive your prompts when you call them. You bring your own key.</li>
      <li>• <strong class="text-foreground">GitHub Pages / your own VPS</strong> — static hosting; standard webserver request logs may be retained per the host's policy.</li>
    </ul>
  </section>

  <section class="space-y-3">
    <h2 class="font-serif text-2xl">Your rights</h2>
    <p class="text-sm leading-relaxed text-muted-foreground">
      Under the GDPR (EU), CCPA (California), and equivalent regulations elsewhere, you have
      the right to access, correct, delete, or export your personal data. Because Cryptex is
      local-first, exercising most of these rights is one click in your own browser:
    </p>
    <ul class="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
      <li>• <strong class="text-foreground">Export</strong> — chat data: <a href="{base}/dataset" class="text-primary underline-offset-2 hover:underline">/dataset</a>; tool history: built into Settings.</li>
      <li>• <strong class="text-foreground">Delete</strong> — <a href="{base}/settings#data" class="text-primary underline-offset-2 hover:underline">Settings → Local data → Clear</a>; account: <a href="{base}/settings#account" class="text-primary underline-offset-2 hover:underline">Settings → Account</a>.</li>
      <li>• <strong class="text-foreground">Withdraw consent</strong> — Settings → Privacy → set to "Rejected".</li>
      <li>• <strong class="text-foreground">Object / restrict</strong> — email us via the contact below.</li>
    </ul>
  </section>

  <section class="space-y-3">
    <h2 class="font-serif text-2xl">Children's privacy</h2>
    <p class="text-sm leading-relaxed text-muted-foreground">
      Cryptex is not directed at children under 13. We do not knowingly collect data from
      children. If you believe a child has provided us data, contact us — we will delete it.
    </p>
  </section>

  <section class="space-y-3">
    <h2 class="font-serif text-2xl">Changes to this policy</h2>
    <p class="text-sm leading-relaxed text-muted-foreground">
      We update this page when we change anything material. The "Last updated" date at the top
      reflects the most recent revision. The full revision history is visible in the public
      Cryptex repository on GitHub — every change is a public commit.
    </p>
  </section>

  <section class="space-y-3 rounded-2xl border border-border/60 bg-card/40 p-5 shadow-glass">
    <h2 class="flex items-center gap-2 font-serif text-2xl">
      <Mail size={18} class="text-primary" />
      Contact
    </h2>
    <p class="text-sm leading-relaxed">
      Questions, concerns, or data requests:
      <a href="mailto:m4xx101101@gmail.com" class="font-medium text-primary underline-offset-2 hover:underline">m4xx101101@gmail.com</a>.
      We aim to respond within 7 business days.
    </p>
  </section>
</article>
