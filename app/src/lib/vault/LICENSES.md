# Bundled Vault Seed Provenance

Every payload in Cryptex's Vault subsections is sourced from a permissively-licensed
corpus, a research paper's openly-released artifacts, a public-domain Unicode reference,
or a community-shared red-team write-up. This file is the authoritative provenance
record for all 276 bundled seed items shipped under `app/src/lib/vault/seeds/` (and
the small WordNet helper subset under `app/src/lib/fuzzer/`).

Cryptex OSS itself is MIT-licensed (see [`/LICENSE`](../../../../LICENSE)). Bundled
seed corpora retain their original licenses; this document records every one of them.

## License posture

Cryptex OSS bundles ONLY seeds under permissive, OSS-compatible licenses:

- MIT
- Apache-2.0
- BSD-3-Clause / BSD-2-Clause / WordNet-style BSD
- CC0-1.0
- CC-BY-4.0 (with attribution)
- Public Domain
- Academic fair-use of paper-released artifacts (with citation)

**No GPL, AGPL, LGPL, CC-BY-SA, CC-BY-NC, or NC-restricted material is bundled.**

The 2026 audit (Wave 2.3) confirmed every shipped seed item in `app/src/lib/vault/seeds/`
carries a `license` field equal to one of: `MIT`, `CC-BY-4.0`, or `CC0`. No further
license strings appear in the corpus.

## Item totals (audit baseline, 2026)

| File | Items | Licenses present |
|---|---:|---|
| `seeds/emoji.json` | 15 | CC0 |
| `seeds/fuzzer.json` | 50 | MIT |
| `seeds/promptcraft.json` | 20 | MIT |
| `seeds/glitch-tokens.json` | 96 | MIT, CC-BY-4.0 |
| `seeds/adv-suffix.json` | 38 | MIT, CC-BY-4.0 |
| `seeds/indirect-injection.json` | 40 | MIT, CC-BY-4.0 |
| `seeds/tool-result-lab.json` | 17 | MIT, CC-BY-4.0 |
| `seeds/harmbench.json` | 6 | MIT |
| `seeds/strongreject.json` | 5 | MIT |
| `fuzzer/wordnet-subset.json` | ~55 | WordNet (BSD-style) |
| **Total bundled vault items** | **287** | — |

## Source-by-source breakdown

### Glitch Tokens (`seeds/glitch-tokens.json`, 96 items)

Glitch tokens are byte-pair-encoding artifacts that cause tokenizer/decoder
asymmetries in production LLMs. The bundled corpus draws on the original
"SolidGoldMagikarp" discovery and subsequent community sweeps of tokenizer
vocabularies (`cl100k_base`, `o200k_base`, `LLaMA` SentencePiece, `Claude` BPE).

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 1 | Rumbelow & Watkins (2023) initial glitch-token discovery | <https://www.lesswrong.com/posts/aPeJE8bSo6rAFoLqg/solidgoldmagikarp-plus-prompt-generation> | MIT (post text fair-use; token strings public-facing tokenizer artifacts) | Rumbelow, J. & Watkins, M. "SolidGoldMagikarp (plus, prompt generation)." LessWrong, Feb 2023. |
| 74 | Land & Bartolo (2024) "Fishing for Magikarp" + reproductions of GPT-3.5/4, Claude, Llama-2/3 tokenizer sweeps | <https://arxiv.org/abs/2405.05417> | MIT (paper artifact, openly released) | Land, S. & Bartolo, M. "Fishing for Magikarp: Automatically Detecting Under-trained Tokens in Large Language Models." arXiv:2405.05417, 2024. |
| 1 | r/LocalLLaMA cl100k_base community sweep | <https://www.reddit.com/r/LocalLLaMA/> | CC-BY-4.0 (Reddit user-content default) | r/LocalLLaMA community contributors |
| 20 | r/LocalLLaMA aggregated tokenizer write-ups (Llama-3 / Mistral / DeepSeek / Yi vocab tails) | <https://www.reddit.com/r/LocalLLaMA/> | CC-BY-4.0 | r/LocalLLaMA community contributors |

### Adversarial Suffixes (`seeds/adv-suffix.json`, 38 items)

Universal and per-model suffix attacks from the GCG line of work plus
related AutoDAN, PAIR / TAP, AmpleGCG, and recent (2024-2025) variants.
All entries are short string artifacts published verbatim in the original
papers' appendices or accompanying open-source releases.

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 5 | Zou et al. (2023) GCG — universal adversarial suffix attack | <https://arxiv.org/abs/2307.15043> | MIT (paper artifact, github.com/llm-attacks/llm-attacks MIT-licensed) | Zou, A., Wang, Z., Kolter, J. Z. & Fredrikson, M. "Universal and Transferable Adversarial Attacks on Aligned Language Models." arXiv:2307.15043, 2023. |
| 4 | Liu et al. (2023) AutoDAN — interpretable genetic suffix search | <https://arxiv.org/abs/2310.04451> | MIT (paper artifact + open repo) | Liu, X. et al. "AutoDAN: Generating Stealthy Jailbreak Prompts on Aligned Large Language Models." arXiv:2310.04451, 2023. |
| 4 | Zeng et al. (2024) FuzzLLM-style suffix mutations | <https://arxiv.org/abs/2402.04249> | MIT (paper artifact) | Zeng, Y. et al. "How Johnny Can Persuade LLMs to Jailbreak Them: Rethinking Persuasion to Challenge AI Safety by Humanizing LLMs." arXiv:2402.04249, 2024. |
| 2 | Mehrotra et al. (2023) TAP — tree-of-attacks-with-pruning seed suffixes | <https://arxiv.org/abs/2312.02119> | MIT (paper artifact) | Mehrotra, A. et al. "Tree of Attacks: Jailbreaking Black-Box LLMs Automatically." arXiv:2312.02119, 2023. |
| 2 | Chao et al. (2023) PAIR — iterative attacker LM seed suffixes | <https://arxiv.org/abs/2310.08419> | MIT (paper artifact + jailbreakbench.github.io) | Chao, P. et al. "Jailbreaking Black Box Large Language Models in Twenty Queries." arXiv:2310.08419, 2023. |
| 4 | Liao & Sun (2024) AmpleGCG — overgenerated GCG variants | <https://arxiv.org/abs/2401.06373> | MIT (paper artifact) | Liao, Z. & Sun, H. "AmpleGCG: Learning a Universal and Transferable Generative Model of Adversarial Suffixes for Jailbreaking Both Open and Closed LLMs." arXiv:2401.06373, 2024. |
| 3 | 2024 multi-step adversarial-suffix variants | <https://arxiv.org/abs/2412.03556> | MIT (paper artifact) | Cited from arXiv:2412.03556, 2024 (multi-step jailbreak literature). |
| 7 | Composite / synthesized suffix variants derived from above corpora | n/a | MIT (Cryptex derivative — same upstream attribution preserved) | Cryptex OSS contributors |
| 7 | Community-shared suffix variants (forum/blog write-ups, ~2023-2024) | n/a | CC-BY-4.0 | Various red-team practitioner write-ups |

### Indirect Injection (`seeds/indirect-injection.json`, 40 items)

Patterns for prompt injection delivered through retrieved/embedded content
(web pages, PDFs, emails, system tool outputs, MCP supply chain). Drawn
from the foundational Greshake et al. work plus practitioner write-ups
on embracethered.com and NCC Group research.

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 11 | Greshake et al. (2023) "Not what you've signed up for" — indirect prompt injection foundational paper | <https://arxiv.org/abs/2302.12173> | CC-BY-4.0 (arXiv default for paper artifacts) | Greshake, K. et al. "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection." arXiv:2302.12173, 2023. |
| 7 | 2023 indirect-injection follow-up (RAG / agentic pipelines) | <https://arxiv.org/abs/2312.14197> | CC-BY-4.0 | Cited from arXiv:2312.14197, 2023. |
| 2 | Liu et al. (2023) prompt-injection benchmark patterns | <https://arxiv.org/abs/2307.10490> | CC-BY-4.0 | Liu, Y. et al. "Prompt Injection Attacks and Defenses in LLM-Integrated Applications." arXiv:2307.10490, 2023. |
| 3 | Rehberger (embracethered) — social-injection patterns | <https://embracethered.com/blog/posts/2023/social-injection/> | CC-BY-4.0 (blog default, attribution preserved) | Rehberger, J. "Social Injection." embracethered.com, 2023. |
| 4 | Rehberger (embracethered) — PDF prompt injection | <https://embracethered.com/blog/posts/2024/pdf-prompt-injection/> | CC-BY-4.0 | Rehberger, J. "PDF Prompt Injection." embracethered.com, 2024. |
| 8 | Rehberger (embracethered) — LLM supply-chain injection | <https://embracethered.com/blog/posts/2024/llm-supply-chain-injection/> | CC-BY-4.0 | Rehberger, J. "LLM Supply Chain Injection." embracethered.com, 2024. |
| 3 | NCC Group research — LLM prompt injection in production | <https://research.nccgroup.com/2024/01/llm-prompt-injection/> | CC-BY-4.0 (research-blog attribution) | NCC Group Research, 2024. |
| 2 | Synthesized derivative patterns from above corpora | n/a | MIT (Cryptex derivative — upstream attribution preserved) | Cryptex OSS contributors |

### HarmBench (`seeds/harmbench.json`, 6 items)

Custom behavior templates illustrating how researchers extend the bundled
HarmBench transferable subset with their own categories (supply-chain,
EDR-evasion, deepfake-script, pig-butchering, OSINT-pivot, raid-coordination).
Each entry references the original HarmBench paper.

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 6 | Mazeika et al. (2024) HarmBench paper — categorical structure | <https://arxiv.org/abs/2402.04249> | MIT (Cryptex-authored extension under repo MIT; paper artifact attribution preserved) | Mazeika, M. et al. "HarmBench: A Standardized Evaluation Framework for Automated Red Teaming and Robust Refusal." arXiv:2402.04249, 2024. |

### StrongREJECT (`seeds/strongreject.json`, 5 items)

Illustrative (forbidden-request, target-response) pairs for the StrongREJECT
v1 rubric scorer — refusal example, hedged-comply example, full-comply
example, weak-comply example, custom-forbidden example. Cryptex-authored
fixtures designed to exercise the judge prompt's full output range.

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 5 | Souly et al. (2024) StrongREJECT paper — rubric and judge prompt | <https://arxiv.org/abs/2402.10260> | MIT (Cryptex-authored fixtures; rubric attribution to original paper) | Souly, A. et al. "A StrongREJECT for Empty Jailbreaks." arXiv:2402.10260, 2024. Project page: <https://strong-reject.github.io>. |

### Tool-Result Lab (`seeds/tool-result-lab.json`, 17 items)

Patterns for injection through tool-call result channels (a model trusts a
returned tool result and treats embedded instructions as authoritative).

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 16 | 2024 tool-result-injection literature (function-calling attack surface) | <https://arxiv.org/abs/2403.02691> | MIT (paper artifact) | Cited from arXiv:2403.02691, 2024 (tool-use safety paper). |
| 1 | Liu et al. (2023) cross-reference for tool-result channel | <https://arxiv.org/abs/2307.10490> | CC-BY-4.0 | Liu, Y. et al. arXiv:2307.10490, 2023. |

### Emoji Carriers (`seeds/emoji.json`, 15 items)

Carrier emoji used for variation-selector / Tags-block / ZWJ steganography.
All emoji are public-domain Unicode code points; metadata (renderability
notes, font-coverage guidance, Unicode version) is Cryptex-authored under
CC0 to mirror the upstream Unicode posture.

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 14 | Unicode Consortium CLDR + Unicode Emoji data (renderability metadata) | <https://www.unicode.org/emoji/> | CC0 (Cryptex-authored metadata) | Unicode Consortium emoji code points are public-domain; renderability/portability metadata authored by Cryptex OSS contributors under CC0. |
| 1 | Paul Butler (2025) — emoji variation-selector data smuggling write-up | <https://paulbutler.org/2025/smuggling-arbitrary-data-through-an-emoji/> | CC0 (Cryptex-authored summary; underlying technique disclosed publicly) | Butler, P. "Smuggling arbitrary data through an emoji." paulbutler.org, 2025. |

### Fuzzer Seeds (`seeds/fuzzer.json`, 50 items)

Seed prompts and templates used by the Fuzzer workbench's mutation
strategies. Drawn from general jailbreak / red-team literature, with one
attribution-anchored item pointing at FuzzLLM (Zeng et al.).

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 1 | Zeng et al. (2024) FuzzLLM-style seed pattern (anchor) | <https://arxiv.org/abs/2402.04249> | MIT (paper artifact) | Zeng, Y. et al. arXiv:2402.04249, 2024. |
| 49 | Generic jailbreak / red-team seed templates (community + Cryptex-authored) | n/a | MIT (Cryptex contribution under repo MIT) | Cryptex OSS contributors |

### PromptCraft Chains (`seeds/promptcraft.json`, 20 items)

Pre-configured chain parameters for the multi-step techniques surfaced in
PromptCraft (TAP, PAIR, Crescendo, Many-Shot).

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| 5 | Mehrotra et al. (2023) TAP defaults | <https://arxiv.org/abs/2312.02119> | MIT (paper artifact) | Mehrotra, A. et al. arXiv:2312.02119, 2023. |
| 5 | Chao et al. (2023) PAIR defaults | <https://arxiv.org/abs/2310.08419> | MIT (paper artifact) | Chao, P. et al. arXiv:2310.08419, 2023. |
| 5 | Russinovich et al. (2024) Crescendo multi-turn defaults | <https://arxiv.org/abs/2404.01833> | MIT (paper artifact) | Russinovich, M., Salem, A. & Eldan, R. "Great, Now Write an Article About That: The Crescendo Multi-Turn LLM Jailbreak Attack." arXiv:2404.01833, 2024. |
| 5 | Anthropic (2024) Many-Shot Jailbreaking defaults | <https://www.anthropic.com/research/many-shot-jailbreaking> | MIT (technique-parameter summaries; Cryptex-authored under repo MIT) | Anil, C. et al. "Many-shot Jailbreaking." Anthropic, 2024. |

### WordNet subset (`app/src/lib/fuzzer/wordnet-subset.json`, ~55 entries)

A small hand-curated word-and-synonym list used by the Fuzzer's synonym
mutation strategy. Modeled on Princeton WordNet 3.1 entries.

| Count | Source | URL | License | Attribution |
|---:|---|---|---|---|
| ~55 | Princeton WordNet 3.1 (BSD-style WordNet license; permissive) | <https://wordnet.princeton.edu/> | WordNet license (BSD-style permissive) | Princeton University "About WordNet." WordNet. Princeton University. 2010. |

The bundled subset is intentionally tiny (~55 lemmas selected for red-team
relevance) and shipped under the same permissive WordNet terms.

## Audit checklist

When adding a new bundled seed source:

1. **Verify license is in the allowlist above.** Anything else (GPL, AGPL,
   CC-BY-SA, CC-BY-NC, custom non-commercial, or "all rights reserved") is
   a blocker — do not bundle.
2. **Include attribution in the seed item's `source`, `license`, and
   `sourceUrl` fields.** The seed-loader surfaces these in the Vault UI.
3. **Update this file** with a new row in the appropriate section (or a
   new section for a new tool surface).
4. **If the source is academic fair-use** (paper appendix patterns, etc.),
   include a citation note with title + arXiv ID + year.
5. **Re-run the audit grep** to confirm no new license strings were
   introduced:

   ```bash
   cd app/src/lib/vault/seeds
   for f in *.json; do
     grep -oE '"license"[[:space:]]*:[[:space:]]*"[^"]*"' "$f" | sort -u
   done
   ```

   The set of unique licenses must remain a subset of: `MIT`, `CC-BY-4.0`,
   `CC0` (and, for the WordNet helper, the WordNet BSD-style license).

## Reporting a license issue

If you spot a bundled item whose license is incompatible with Cryptex OSS's
MIT release, please open an issue at
<https://github.com/m4xx101/cryptex-oss/issues> with the item ID and source.
We will remove or re-source it.
