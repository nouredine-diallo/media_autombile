# Fix RADAR→STUDIO Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RADAR→STUDIO a 1-click flow — validated article opens STUDIO with all data pre-filled, titles auto-generated, export returns to RADAR dashboard.

**Architecture:** Fix the prefill link URL (point to `/titres` not `/`), use env var instead of hardcoded IP, auto-generate titles after prefill, show source context, and fix the export callback redirect.

**Tech Stack:** Next.js, React, TypeScript, URLSearchParams, Base64Url encoding

**Spec:** `docs/superpowers/plans/2026-08-26-fix-radar-to-studio-workflow.md` (this file)

## Global Constraints

- Two Next.js apps: RADAR (port 3000) and STUDIO (port 3002)
- Shared SQLite DB at `/opt/media-labs/data/radar.db`
- Prefill data encoded as Base64Url JSON in `?prefill=` query param
- STUDIO has NO active middleware — auth cookie shared via same domain
- `STUDIO_URL` env var exists but is ignored by `buildStudioLink()`
- Style: tutoiement, factuel-complice, phrases courtes

---

## Task 1: Fix prefill link URL — point to `/titres` instead of `/`

**Files:**
- Modify: `RADAR/src/lib/studio-prefill.ts:72`

**Problem:** `buildStudioLink()` returns `http://89.168.53.133:3002?prefill=...` — the STUDIO landing page (`/`) is a static page with a "Créer un post" button. It does NOT read `?prefill=`. When user clicks that button → `/nouveau-post` → `redirect("/titres")` → URL params are LOST.

**Fix:** Change the URL path from root `/` to `/titres` so the prefill param lands on the page that actually reads it.

- [ ] **Step 1: Update `buildStudioLink()` to point to `/titres`**

```typescript
// RADAR/src/lib/studio-prefill.ts — line 72
// BEFORE:
return `http://89.168.53.133:3002?prefill=${encoded}`;

// AFTER:
return `${getStudioUrl()}/titres?prefill=${encoded}`;
```

(We also fix the hardcoded IP in this same change — see Task 2.)

- [ ] **Step 2: Verify the fix**

Open browser dev tools, click "Créer un post" from RADAR dashboard. URL should be:
`http://89.168.53.133:3002/titres?prefill=<base64>` (not `/?prefill=...`).

The `/titres` page useEffect should fire, decode the prefill, and auto-fill the theme field.

- [ ] **Step 3: Commit**

```bash
git add RADAR/src/lib/studio-prefill.ts
git commit -m "fix(prefill): point to /titres instead of / to preserve query params"
```

---

## Task 2: Use `STUDIO_URL` env var instead of hardcoded IP

**Files:**
- Modify: `RADAR/src/lib/studio-prefill.ts:58-73`

**Problem:** Line 72 hardcodes `http://89.168.53.133:3002`. The env var `STUDIO_URL` is documented in `RADAR/CLAUDE.md` §12 but never used.

**Fix:** Add a `getStudioUrl()` helper that reads `process.env.STUDIO_URL` with fallback to the current IP for backward compatibility.

- [ ] **Step 1: Add `getStudioUrl()` helper and update `buildStudioLink()`**

```typescript
// RADAR/src/lib/studio-prefill.ts — add before buildStudioLink()

function getStudioUrl(): string {
  return process.env.STUDIO_URL || "http://89.168.53.133:3002";
}

// Then update buildStudioLink() line 72:
export function buildStudioLink(params: {
  title: string;
  source: string;
  imageUrl: string | null;
  contentId: string;
  briefHeadline: string;
}): string {
  const encoded = encodeStudioUrl({
    t: params.title,
    s: params.source,
    i: params.imageUrl || 'empty',
    c: params.contentId,
    b: params.briefHeadline,
  });
  return `${getStudioUrl()}/titres?prefill=${encoded}`;
}
```

- [ ] **Step 2: Verify env var is set**

Check `.env` or `.env.local` in RADAR for `STUDIO_URL=https://studio.media-labs.is-a.dev`. If not set, add it. The fallback ensures it still works without the env var.

- [ ] **Step 3: Verify all 3 call sites use the updated function**

The 3 call sites are:
- `RADAR/src/app/page.tsx:271` (dashboard "Créer un post")
- `RADAR/src/app/ready/page.tsx:125` (ready page)
- `RADAR/src/app/events/[id]/page.tsx:1296` (event detail)

All 3 call `buildStudioLink()` — no changes needed at call sites.

- [ ] **Step 4: Commit**

```bash
git add RADAR/src/lib/studio-prefill.ts
git commit -m "fix(prefill): use STUDIO_URL env var instead of hardcoded IP"
```

---

## Task 3: Auto-generate titles after prefill

**Files:**
- Modify: `studio/src/app/titres/page.tsx:121-157` (the prefill useEffect)

**Problem:** After prefill fills the theme field, the user must still click "Générer 3 titres" manually. This is 1 unnecessary click.

**Fix:** At the end of the prefill useEffect, if `data.t` (theme) is set, automatically call `handleGenerate()`.

- [ ] **Step 1: Add auto-generation to prefill useEffect**

The current useEffect (lines 121-157) needs to trigger generation after setting the theme. Since `handleGenerate` uses `theme` state which is set via `setTheme`, we need to use a ref or pass the theme directly.

Best approach: call the generate API directly with `data.t` instead of going through `handleGenerate()` (which depends on state that hasn't updated yet).

```typescript
// Inside the prefill useEffect, after setting theme and before cleanup:

// Auto-générer les titres si on a un thème
if (data.t) {
  setTheme(data.t);
  // Auto-generate: call API directly with the theme (state not yet updated)
  setStatus("loading");
  fetch("/api/titles/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: data.t }),
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.titles) {
        setTitles(data.titles);
        setSurtitres(data.surtitres ?? []);
        setParagraphs(data.paragraphs ?? []);
        setProvider(data.provider);
        setSelectedIndex(data.titles.length > 0 ? 0 : null);
        if (data.paragraphs && data.paragraphs.length > 0) {
          setSelectedParagraph(0);
        }
        const firstSurtitre = (data.surtitres ?? []).find((s: string) => s.length > 0);
        if (firstSurtitre) setSelectedSurtitre(firstSurtitre);
      }
      setStatus("idle");
    })
    .catch(() => {
      setStatus("idle");
      // L'utilisateur peut réessayer manuellement
    });
}
```

- [ ] **Step 2: Verify the flow**

1. Click "Créer un post" from RADAR dashboard
2. STUDIO opens at `/titres?prefill=...`
3. Theme field is auto-filled
4. Titles are auto-generated (loading spinner appears, then 3 titles show)
5. First title is auto-selected
6. User can immediately click "Exporter ce post"

- [ ] **Step 3: Commit**

```bash
git add studio/src/app/titres/page.tsx
git commit -m "feat(prefill): auto-generate titles after prefill from RADAR"
```

---

## Task 4: Show source context in STUDIO header

**Files:**
- Modify: `studio/src/app/titres/page.tsx` (add state + UI)
- Modify: `studio/src/lib/prefill.ts` (already has `s` and `b` fields)

**Problem:** `source` (feed name) and `briefHeadline` (article summary) are sent by RADAR but silently dropped. The user has no context about where the article came from.

**Fix:** Store `source` and `briefHeadline` in state, display them as a subtle context badge below the header.

- [ ] **Step 1: Add state for source context**

```typescript
// In titres/page.tsx, add near the other state declarations:
const [sourceContext, setSourceContext] = useState<{ source: string; headline: string } | null>(null);
```

- [ ] **Step 2: Populate from prefill**

Inside the prefill useEffect, after `if (data.c) setContentId(data.c)`:

```typescript
if (data.s || data.b) {
  setSourceContext({ source: data.s, headline: data.b });
}
```

- [ ] **Step 3: Add context badge in header**

After the header `<div>` with the SA logo, add:

```tsx
{sourceContext && (
  <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
    {sourceContext.source && (
      <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium">
        {sourceContext.source}
      </span>
    )}
    {sourceContext.headline && (
      <span className="truncate max-w-xs">
        {sourceContext.headline}
      </span>
    )}
  </div>
)}
```

- [ ] **Step 4: Verify**

After prefill from RADAR, the header should show the source name (e.g., "RSS: Formula1.com") and the brief headline as context.

- [ ] **Step 5: Commit**

```bash
git add studio/src/app/titres/page.tsx
git commit -m "feat(prefill): show source context from RADAR in STUDIO header"
```

---

## Task 5: Fix export redirect — point to RADAR dashboard

**Files:**
- Modify: `studio/src/app/export/[jobId]/ExportConfirmationClient.tsx:138-143`

**Problem:** The "Retour à l'accueil" link points to `/` (STUDIO landing page). After export, the user wants to go back to RADAR, not stay in STUDIO.

**Fix:** Replace the link with a redirect to RADAR's dashboard. Use `RADAR_URL` env var or fallback to the known URL.

- [ ] **Step 1: Replace the "Retour" link**

```tsx
// BEFORE (line 138-143):
<Link
  href="/"
  className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
>
  Retour à l&apos;accueil
</Link>

// AFTER:
<a
  href={`${process.env.NEXT_PUBLIC_RADAR_URL || "http://89.168.53.133:3000"}/?exported=1`}
  className="text-sm font-medium text-zinc-500 hover:text-zinc-700"
>
  Retour au dashboard RADAR
</a>
```

Note: This is a client component, so `process.env.NEXT_PUBLIC_RADAR_URL` needs the `NEXT_PUBLIC_` prefix to be available client-side. Alternatively, use a hardcoded fallback.

- [ ] **Step 2: Add `NEXT_PUBLIC_RADAR_URL` to STUDIO env**

In STUDIO's `.env` or `.env.local`, add:
```
NEXT_PUBLIC_RADAR_URL=http://89.168.53.133:3000
```

Or use the existing env var pattern. Check what's available.

- [ ] **Step 3: Verify**

1. Complete an export from STUDIO
2. On the export confirmation page, click "Retour au dashboard RADAR"
3. Should navigate to RADAR's dashboard (`/?exported=1`)

- [ ] **Step 4: Commit**

```bash
git add studio/src/app/export/[jobId]/ExportConfirmationClient.tsx
git commit -m "fix(export): redirect to RADAR dashboard after export instead of STUDIO landing"
```

---

## Task 6: Add post-export success notification to RADAR dashboard

**Files:**
- Modify: `RADAR/src/app/page.tsx` (check `?exported=1` and show toast)

**Problem:** After export, user clicks "Retour au dashboard RADAR" but sees no confirmation that the export succeeded.

**Fix:** Check for `?exported=1` query param on the RADAR dashboard and show a success toast/banner.

- [ ] **Step 1: Add exported notification to RADAR dashboard**

In `RADAR/src/app/page.tsx`, add a client-side check for the query param and display a temporary success message.

Since this is likely a server component, we need a small client wrapper or use `useSearchParams()` in a client component.

Best approach: Add a small `ExportedToast` client component.

```tsx
// Create: RADAR/src/components/ExportedToast.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export function ExportedToast() {
  const searchParams = useSearchParams();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (searchParams.get("exported") === "1") {
      setShow(true);
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => setShow(false), 5000);
      // Clean URL
      window.history.replaceState({}, "", "/");
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  if (!show) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-lg">
      ✅ Post exporté avec succès !
    </div>
  );
}
```

- [ ] **Step 2: Add `<ExportedToast />` to RADAR dashboard layout or page**

In `RADAR/src/app/page.tsx` (or layout), add:
```tsx
import { ExportedToast } from "@/components/ExportedToast";
// In the JSX:
<ExportedToast />
```

Note: `page.tsx` may be a server component. If so, wrap the import in a client boundary or add it to a client layout.

- [ ] **Step 3: Verify**

1. Export from STUDIO
2. Click "Retour au dashboard RADAR"
3. Green toast appears: "Post exporté avec succès !"
4. Toast auto-dismisses after 5 seconds

- [ ] **Step 4: Commit**

```bash
git add RADAR/src/components/ExportedToast.tsx RADAR/src/app/page.tsx
git commit -m "feat(dashboard): show success toast after export from STUDIO"
```

---

## Task 7: Update TODO.md with completion status

**Files:**
- Modify: `TODO.md`

**Problem:** Objectives 1 and 2 are complete but TODO.md doesn't reflect this.

**Fix:** Update the TODO.md to mark completed tasks.

- [ ] **Step 1: Update TODO.md**

Mark Objective 1 (Content Engine) and Objective 2 (Gabarit 1B) as DONE. Add notes about what was completed.

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: update TODO.md with Objectives 1 & 2 completion status"
```

---

## Verification Checklist

After all tasks are complete, verify the full flow:

1. **RADAR Dashboard → STUDIO (with prefill)**
   - Click "Créer un post" on a validated article
   - STUDIO opens at `/titres?prefill=...` (NOT `/?prefill=...`)
   - Theme is auto-filled
   - Titles auto-generate (loading → 3 results)
   - First title auto-selected
   - Source context visible in header
   - Image auto-uploaded (if available)

2. **STUDIO → Export → RADAR**
   - Click "Exporter ce post"
   - Export completes
   - Click "Retour au dashboard RADAR"
   - RADAR dashboard shows success toast

3. **Env vars**
   - `STUDIO_URL` is used by `buildStudioLink()` (not hardcoded IP)
   - `NEXT_PUBLIC_RADAR_URL` is used by export page (not hardcoded)

4. **No regressions**
   - Manual STUDIO access (without prefill) still works
   - RADAR dashboard loads correctly
   - Export flow still works
