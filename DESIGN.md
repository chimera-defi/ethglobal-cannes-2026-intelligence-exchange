# Design System — Intelligence Exchange

## Product Context

- **What this is:** A two-sided marketplace where buyers fund AI agent milestone work and workers earn by completing it. Smart contracts gate payouts. Human reviewers are the acceptance mechanism.
- **Who it's for:** Technical buyers (engineering/product teams with AI work backlogs) and technical workers (operators running Claude Code, GPT, local LLM stacks). Not normies. Not DeFi degens. Thoughtful builder/operator types.
- **Space/industry:** AI agent infrastructure / on-chain coordination. ETHGlobal Cannes 2026 hackathon.
- **Project type:** Two-sided marketplace web app — part dashboard, part job board, part review tool.

## Aesthetic Direction

- **Direction:** Industrial/Professional Exchange — Bloomberg terminal energy, not DeFi startup. The product is a clearing house. It should feel like infrastructure.
- **Decoration level:** Intentional — every non-data pixel earns its place by communicating state. No illustrations. No decorative blobs. No empty-state artwork.
- **Mood:** Dense, legible, purposeful. A tool built for people who read the source code. Looks like something you'd trust to hold funds.
- **Key insight:** Most AI agent / crypto platforms pick the same direction — dark navy, purple/blue gradient, Inter, 3-column icon grid, "built for the future of X." Intelligence Exchange should feel like infrastructure, not startup theater.

## Typography

- **Display/Hero:** [Departure Mono](https://github.com/rektdeckard/departure-mono) — used for job titles, prices, milestone status headers, and the hero headline. Monospaced at large sizes is the deliberate departure: it signals execution over aesthetics. Most platforms put mono in code blocks; we put it at the top of the hierarchy.
- **Body/UI:** Plus Jakarta Sans — warm grotesque, documentation-readable, excellent at small label sizes. Used for all prose, form labels, nav, descriptions.
- **Data/Code:** JetBrains Mono — job IDs, wallet addresses, agent fingerprints, timestamps, claim counts, hash values. Everywhere data is live and unformatted.
- **Loading strategy:** Google Fonts CDN. Import Departure Mono from its GitHub releases as a self-hosted woff2.
- **Scale (px/rem at 16px base):**
  - xs: 11px / 0.6875rem
  - sm: 12px / 0.75rem (labels, metadata)
  - base: 14px / 0.875rem (body default)
  - md: 16px / 1rem
  - lg: 18px / 1.125rem (card titles)
  - xl: 20px / 1.25rem
  - 2xl: 24px / 1.5rem (section headers)
  - 3xl: 30px / 1.875rem (page titles)
  - display: 48px / 3rem (hero in Departure Mono)

## Color

- **Approach:** Restrained with one warm semantic accent. Color is rare and carries meaning. The amber accent is used exclusively for human-attention states.
- **Background:** `#070D1A` — deep navy-black. Slightly warmer than a neutral near-black. Makes surfaces feel elevated above it.
- **Surface (cards):** `#0D1625` — blue-black. Every card has a 1px `#1E2D42` border. No borderless floating cards.
- **Surface raised:** `#131F32` — for selected states, popovers, expanded sections.
- **Primary:** `#3B82F6` — blue-500. The established expectation. Don't reinvent the blue.
- **Amber (human-review):** `#F59E0B` — used exclusively for `submitted`, `in-review`, and `rework` states. The only warm color in the system. Signals: a human is looking at this right now. Distinct from warning (warning is a system state; amber is a human-attention state).
- **Muted text:** `#4B5A70` — blue-gray muted, not neutral gray. Maintains the naval palette in low-emphasis text.
- **Body text:** `#C8D6E8` — off-white with a blue tint. Never pure white. Pure white fights the dark background too hard.
- **Success:** `#10B981` — green-500. Proof accepted, payout released, milestone settled.
- **Error:** `#EF4444` — red-500. Dispute, failed claim, rejected proof.
- **Border:** `#1E2D42` — 1px. Present on every card and panel. The grid is always visible.
- **Dark mode only:** No light mode for this product. The target user is a developer. Dark is the expectation.

### CSS Variables (add to index.css `:root`)

```css
--background: 220 80% 6%;      /* #070D1A */
--card: 220 62% 9%;            /* #0D1625 */
--card-raised: 220 58% 13%;    /* #131F32 */
--foreground: 213 45% 84%;     /* #C8D6E8 */
--muted-foreground: 213 20% 36%; /* #4B5A70 */
--border: 213 38% 18%;         /* #1E2D42 */
--primary: 221 83% 60%;        /* #3B82F6 */
--primary-foreground: 0 0% 100%;
--amber: 38 92% 50%;           /* #F59E0B — human review */
--amber-foreground: 0 0% 100%;
--success: 160 84% 39%;        /* #10B981 */
--destructive: 0 84% 60%;      /* #EF4444 */
```

## Spacing

- **Base unit:** 4px
- **Density:** Compact — this is a data-dense tool, not a marketing site. Comfortable reading density, but no generous padding.
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(12px) lg(16px) xl(24px) 2xl(32px) 3xl(48px)

## Layout

- **Approach:** Two-column fixed inside app pages. Left column (240–340px, fixed, non-scrolling) for filters, identity summary, navigation context. Right column (flex-1) for the primary data list.
- **Landing page:** Left-aligned with numbered `<ol>` timeline (already implemented). No changes needed.
- **Grid:** 12-column system. App layouts use the split. Landing is max-w-5xl centered.
- **Max content width:** 1200px
- **Border radius:**
  - Form inputs, pill badges: 4px (rounded-sm) — rectangular reads more professional
  - Cards: 8px (rounded-md)
  - Buttons: 6px — slightly softer than cards but not fully rounded
  - Full-round (avatars, status dots): 9999px

## Status-Driven Card Left Border

Job cards use a 2px left border as a semantic data visualization (not decoration):

```
border-l-2 border-l-[#3B82F6]   → queued (blue, available)
border-l-2 border-l-[#F59E0B]   → claimed / submitted / rework (amber, human attention)
border-l-2 border-l-[#10B981]   → accepted / settled (green, complete)
border-l-2 border-l-[#EF4444]   → rejected (red, action required)
border-l-2 border-border        → default / created (neutral)
```

This is NOT the `absolute top-0 left-0 w-1 h-full bg-*` static decorative strip (that pattern is banned). This is a dynamic semantic indicator applied via CSS class based on live data.

## Motion

- **Approach:** Minimal-functional. Nothing loops. Nothing breathes. Motion communicates data changed, not brand personality.
- **Easing:** `ease-out` for enter, `ease-in` for exit, `ease-in-out` for positional moves.
- **Duration reference:**
  - Status color transition: 150ms
  - Item entering list: 200ms (translateY 8px→0 + opacity 0→1)
  - Accepted/settled pulse: 400ms, fires once, then static. Not continuous.
  - Page transitions: none — routes swap at cut speed. This is a terminal.
- **Loading:** Thin (2px) indeterminate horizontal progress bar at the top of the viewport (shadcn's `Progress` component). No spinners in the page body. No `Loader2` in content areas — use `Skeleton` instead.

## Anti-Slop Rules

These patterns are banned. Any code that introduces them will be flagged in review.

1. **No purple/violet gradients** as an accent or CTA pattern
2. **No 3-column icon grid** for features or "How It Works" (use numbered timeline)
3. **No `text-center` on section headers** in app pages (landing hero is the only exception)
4. **No absolute-positioned decorative borders** (`absolute top-0 left-0 w-1 h-full bg-*`)
5. **No `→` as bullet character** — use `<ul className="list-disc list-inside">` or lucide icons
6. **No inline Tailwind color utilities for semantic states** — use design tokens and component variants
7. **No empty-state illustrations** — text only: concise description + primary action button
8. **No ambient animations** — nothing loops, nothing pulses continuously
9. **No borderless floating cards** — all cards have `border border-border`
10. **No pure `#FFFFFF` text** — use `#C8D6E8` or the `foreground` CSS variable

## Worker Identity — Spec Sheet, Not Profile

Worker identity surfaces (on claim rows, in review panels) should read like a hardware datasheet, not a social profile:

- Lead with: `agent type · version · on-chain token ID`
- Secondary: `accepted claims · dispute rate`
- Wallet address in JetBrains Mono, truncated: `0x1234…5678`
- No avatars for jobs or agents. Jobs are work orders. Agents are execution units.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-04 | Initial design system created | /design-consultation — industrial/professional exchange aesthetic. Approved by user directly (skipped mockups). Both Claude main and Claude subagent agreed on core direction. |
| 2026-04-04 | Departure Mono as display font | Deliberate departure: mono at display scale signals execution over aesthetics. Most platforms use grotesque for headlines. |
| 2026-04-04 | Amber (#F59E0B) as human-review semantic color | Fourth semantic color, distinct from warning. Signals "human is looking at this" — different from a system warning state. |
| 2026-04-04 | All cards have visible 1px border | Communicates structure and seriousness. Departs from "floating card" aesthetic common in consumer products. |
| 2026-04-04 | Status-driven 2px left border on job cards | Semantic data visualization (not decoration). Enables peripheral-vision job scanning — you can read 20 jobs in 2 seconds. |
| 2026-04-04 | Navy-black (#070D1A) background instead of gray-950 | Blue-tinted background maintains palette coherence with the blue-primary accent. Pure gray reads as generic dark UI. |
