<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { supabase } from '$lib/auth/supabase';

  let message = $state('Signing you in…');

  onMount(async () => {
    if (!supabase) {
      void goto(`${base}/`);
      return;
    }
    const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.search);
    if (error) {
      message = `Sign-in failed: ${error.message}. Redirecting…`;
      setTimeout(() => void goto(`${base}/login`), 2000);
      return;
    }
    if (data.session) {
      void goto(`${base}/chat`);
    } else {
      message = 'Sign-in returned no session. Redirecting…';
      setTimeout(() => void goto(`${base}/login`), 2000);
    }
  });
</script>

<p class="m-auto mt-24 text-center text-sm text-muted-foreground">{message}</p>
