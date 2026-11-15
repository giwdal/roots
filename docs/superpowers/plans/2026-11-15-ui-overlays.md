# UI: Bottom Sheets, Phones First, One Way to Show Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything that opens over a page in the App rises from the bottom, works by thumb on a phone (swipe to close, keyboard-aware), the most used things are one tap away on phones, record data is shown one way everywhere, and all of it is written down in the binding UI guide `docs/design/app.md` that every agent loads.

**Architecture:** `<ContentSheet>` (`src/components/content-sheet.tsx`, used by all ~45 `<UrlSheet>` drawers) switches from Base UI `Dialog` to Base UI `Drawer` (already installed, `@base-ui/react` 1.8.0: swipe-to-dismiss, nested drawers, virtual keyboard handling), keeping its props; a `compact` variant covers confirmations. The five remaining non-bottom overlays move onto it and a `node --test` guard keeps it that way. Phones get a floating glass tab bar in `<AppShell>` in the iOS style: a capsule with Start · Suche · Menü, plus the page's primary action as a separate round button next to it (four elements at most). Sprout stays in the top bar. A new `<DetailList>` replaces five hand-made `<dl>` grids. The UI rules move out of `AGENTS.md` into `docs/design/app.md`; `CLAUDE.md` imports it, `AGENTS.md` points to it.

**Tech Stack:** Next.js 16 (App Router), React 19, Base UI `Drawer` / `Dialog`, Tailwind v4 tokens, `node --test` (`npm test`).

**Spec:** this conversation (2026-11-15): "überall drawer … die sich von unten öffnen"; "eine .md datei, wo definiert wird, wie sich die ui verhalten soll … agents sollen die datei immer lesen"; "einige Elemente [müssen] mobil gut abrufbar sein … mobil ist wichtig"; "eine gute Möglichkeit die Daten aus den drawern und co auch anzuzeigen. Das muss auch in der md Datei festgelegt sein." Decision by the user: confirmations become a compact bottom sheet too.

### Inventory (today)

| Where | Overlay today | Becomes |
|---|---|---|
| ~45 screens via `<UrlSheet>` | bottom `<ContentSheet>` (Base UI Dialog, no swipe) | same, on Base UI Drawer (swipe, handle, keyboard) |
| `src/components/confirm-submit.tsx` `<ConfirmHost>` | centred `ui/dialog` | `<ContentSheet compact>` |
| `src/app/(app)/settings/team/invite-link.tsx` | centred `ui/dialog` | `<ContentSheet compact>` |
| `src/app/(app)/settings/integrations/page.tsx:208` (`?connect=`) | centred `<UrlDialog>` holding a form | `<UrlSheet params={["connect"]}>` |
| `src/components/contact-picker.tsx:159` `QuickCreate` | right-hand `ui/sheet` | `<ContentSheet>` |
| `src/components/url-dialog.tsx` | — | deleted |
| ⌘K `CommandDialog`, phone nav (sidebar's left sheet), Sprout panel, anchored popovers, `window.confirm` in SaveBar, `window.prompt` in the rich-text/wiki editors | — | stay (documented exceptions) |

Phones today: navigation and Sprout sit in the top bar (sidebar trigger top left), the page's "+ Neu" scrolls away with the header, sheets can't be swiped closed. Data in drawers: five different hand-made `<dl>` grids (`payments/page.tsx:142`, `cashbook/page.tsx:367`, `forms/[id]/submissions/page.tsx:101`, `invoices/[id]/page.tsx:152`, `email/templates/page.tsx:160`).

## Global Constraints

- No hardcoded UI text: every string in `src/i18n/messages/de.json` **and** `en.json` (build fails otherwise). Reuse existing keys (`common.cancel`, `common.confirm`, `common.close`, `search.open`, `sprout.name`, `contacts.new`, `members.renew*`, `integrations.connectTitle`, the existing "Start" nav label); new keys only where a step names them.
- Semantic tokens only, no raw colours; `lucide-react` icons only; don't hand-edit `src/components/ui/*`.
- Every screen at 375px, 768px, 1280px, light and dark. Phone = below `md` (768px).
- No new dependency (Base UI Drawer is already installed).
- `npm run lint`, `npm test`, `npm run build` pass before each commit. Work on branch `ui-overlays` (a push to `main` deploys production). No AI attribution in commits.

## Review Focus

1. **Swipe with unsaved input**: swiping a drawer down with a dirty form asks first; "Abbrechen" snaps the sheet back with the input intact. → Task 1 Step 4.
2. **Swipe vs. scroll**: in a long drawer (task drawer `?task=`) scrolled halfway, dragging down scrolls the content; only at the top does it close the sheet. → Task 1 Step 4.
3. **Confirm from inside a drawer** (⋯ → trash): only the confirm sheet closes on cancel/Escape/backdrop; the drawer below keeps its input. Quick create from a contact picker inside a drawer returns the new contact to that drawer. → Task 2 Step 6.
4. **Bar vs. SaveBar and keyboard on phones**: while a page SaveBar shows (dirty edit page, create page) or an input has focus, the floating bar and its "+" are hidden, so the SaveBar takes the bottom and nothing floats over the keyboard; after saving/cancelling/blur the bar returns. → Task 4 Step 6.
5. **Einlass (`/scan`)**: its own bottom tab bar still works on phones and the App's floating bar is hidden there (no double bar). → Task 4 Step 6.

---

### Task 1: `ContentSheet` on Base UI Drawer (phone behaviour + `compact`)

**Files:**
- Modify: `src/components/content-sheet.tsx`

**Interfaces:**
- Produces (props unchanged + one new): `ContentSheet({ onClose, onClosed, wide?, compact?, header, children, label? })`. `onClose()` returning `false` vetoes any close (X, Escape, backdrop, **swipe**). Exports `ContentSheetTitle`, `ContentSheetDescription`, and new `ContentSheetClose` (= `Drawer.Close`, closes with the slide-down; `onClosed` runs after). Keeps `data-slot="sheet-content"` on the popup (SaveBar and `confirmDiscard` rely on it).

- [ ] **Step 1: Rebuild on `@base-ui/react/drawer`**

Read `node_modules/@base-ui/react/drawer/**/*.d.ts` for the part names first. `Drawer.Root` with `swipeDirection="down"`, controlled `open`; `onOpenChange(o)` → when closing, call `onClose()` and keep it open if it returns `false`; `onOpenChangeComplete(false)` → `onClosed()`. Wrap the popup in `Drawer.VirtualKeyboardProvider` so a focused input is never under the phone keyboard. Keep `place()` (content area on `md+`, full width below the top bar on phones), the backdrop look (`bg-black/20`, no blur), rounded top, sticky title bar with X.
Add a grab handle above the title (`mx-auto h-1.5 w-10 rounded-full bg-muted-foreground/30`, `md:hidden`, `aria-hidden`). Add `pb-[env(safe-area-inset-bottom)]` to the popup.

- [ ] **Step 2: Add `compact`**

`compact`: no `top` (height = content, `max-height` = viewport below the top bar), inner column `max-w-xl`; otherwise unchanged (`wide ? max-w-6xl : max-w-3xl`).

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build` → no errors.

- [ ] **Step 4: Check in the browser** (preview `dev` from `.claude/launch.json`, signed in; `resize_window` preset `mobile` = touch emulation, then `desktop`)

1. Mitglieder → Typen → open a type (`?edit=`) at 375px: handle visible, sheet full width; drag the handle down (`left_click_drag`) → closes, URL loses `edit`.
2. Same, type into a field first, drag down → discard question → cancel → sheet back, value still there.
3. Projects → open a task (`?task=`), scroll halfway, drag inside the content down → it scrolls, doesn't close.
4. Focus the last input of a long drawer at 375px → it stays visible above the keyboard area (best effort in emulation; note if not testable).
5. 1280px: X, Escape and backdrop close as before; no handle; sheet sits beside sidebar/Sprout.

Expected: all pass, no console errors.

- [ ] **Step 5: Commit** — `git checkout -b ui-overlays`, then commit `src/components/content-sheet.tsx` ("ContentSheet on Base UI Drawer: swipe down to close (asks when unsaved), grab handle and keyboard handling on phones, compact variant").

---

### Task 2: Move the remaining overlays onto `ContentSheet` + guard test

**Files:**
- Create: `src/components/overlays.test.mjs`
- Modify: `src/components/confirm-submit.tsx`, `src/app/(app)/settings/team/invite-link.tsx`, `src/app/(app)/settings/integrations/page.tsx`, `src/components/contact-picker.tsx`
- Delete: `src/components/url-dialog.tsx`

**Interfaces:**
- Consumes: `ContentSheet`, `ContentSheetTitle`, `ContentSheetDescription`, `ContentSheetClose` (Task 1); `UrlSheet` as is.

- [ ] **Step 1: Write the failing guard** `src/components/overlays.test.mjs`

`test("overlays: only bottom sheets outside the allowed exceptions")`: walk `.ts`/`.tsx` under `src/` except `src/components/ui/`, collect files matching `/from "@\/components\/ui\/(dialog|sheet)"/`, `/from "@base-ui\/react\/(dialog|drawer)"/` or `/url-dialog/`; allowed: `src/components/content-sheet.tsx`. `assert.deepEqual(offenders, [], "… see docs/design/app.md#overlays")`.

- [ ] **Step 2: Run, expect FAIL** — `node --test --no-warnings src/components/overlays.test.mjs` lists `confirm-submit.tsx`, `contact-picker.tsx`, `url-dialog.tsx`, `settings/integrations/page.tsx`, `settings/team/invite-link.tsx`.

- [ ] **Step 3: Migrate**

- `ConfirmHost`: `{ask && <ContentSheet compact key={n} label={title} onClose={() => {}} onClosed={() => setAsk(null)} header={title + optional hint via ContentSheetTitle/Description}>`, `key` = counter bumped per ask. Button row `flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end` (phones: full-width buttons, main action at the bottom): *Abbrechen* = `<ContentSheetClose render={<Button variant="outline" />}>`, then the destructive confirm (`autoFocus`, label = submit text or `common.confirm`). `confirm()` logic unchanged (`passed.current`, `requestSubmit`, `setAsk(null)`).
- `InviteLink`: `{open && <ContentSheet compact … onClosed={() => setOpen(false)}>}`, header `members.renewTitle` + `members.renewText`, body = read-only input + the two buttons in the same phone-first row; "Kopieren & schließen" = `<ContentSheetClose render={<Button />} onClick={() => copy()}>`. Keep the TODO.
- Integrations: `<UrlDialog params={["connect"]} title description>` → `<UrlSheet params={["connect"]} title description>`; form unchanged; drop the import.
- `QuickCreate`: `<ContentSheet label onClose={() => {}} onClosed={onClose} header={<ContentSheetTitle>{t("contacts.new")}</ContentSheetTitle>}>`, fields `grid gap-4 px-6 pt-6 sm:grid-cols-2`, save button below (`px-6 pb-8`, full width on phones), spinner kept.
- `git rm src/components/url-dialog.tsx`.

- [ ] **Step 4: Run all tests, expect PASS** — `npm test`.

- [ ] **Step 5: Lint + build** — `npm run lint && npm run build`.

- [ ] **Step 6: Check in the browser** (375px with touch, then 1280px)

1. Kontakte: tick 2 → bulk trash → compact sheet says 2 → Abbrechen → nothing deleted; again → confirm → both in the trash, exactly one request (`read_network_requests`).
2. Mitglieder → Typen `?edit=`: type in a field, ⋯ → delete → Escape: confirm closes, drawer and value stay.
3. A drawer with a `<ContactPicker>` (e.g. a rental) → "Neu anlegen" → sheet over the drawer → save → the picker shows the new contact.
4. Settings → Integrationen → connect a provider with fields → bottom sheet with setup steps; wrong key → stays open with the error; close → no `connect`/`error` in the URL.
5. Settings → Team → "Link erneuern" → compact sheet, "Kopieren & schließen" closes it.

Screenshot 1 at 375px and 1280px as proof.

- [ ] **Step 7: Commit** — the five files + test ("Overlays: confirmations, invite link, integration connect, contact quick create are bottom sheets; UrlDialog gone; test guards against dialogs/side sheets").

---

### Task 3: `<DetailList>` — one way to show a record's data

**Files:**
- Create: `src/components/detail-list.tsx`
- Modify: `src/app/(app)/payments/page.tsx:142`, `src/app/(app)/cashbook/page.tsx:367`, `src/app/(app)/forms/[id]/submissions/page.tsx:101`, `src/app/(app)/invoices/[id]/page.tsx:152`, `src/app/(app)/email/templates/page.tsx:160`

**Interfaces:**
- Produces: `DetailList({ items, className? }: { items: (DetailItem | false | null | undefined)[]; className?: string })`, `type DetailItem = { label: React.ReactNode; value: React.ReactNode }`. Falsy items are skipped (conditional rows); a value of `null`/`undefined`/`""` renders `–`. Server component (no `"use client"`).

- [ ] **Step 1: Implement** — `<dl>` with `grid gap-y-3 text-sm sm:grid-cols-[minmax(7rem,max-content)_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-2`; each row `<dt className="text-muted-foreground">` + `<dd className="min-w-0 break-words">`. Phones: label above its value (one column); from `sm`: two columns.

- [ ] **Step 2: Replace the five `<dl>` blocks** with `<DetailList items={[…]}>`, same labels and values, conditional rows as `cond && { label, value }`. Leave alone: the invoice editor's totals (`invoices/[id]/editor.tsx:277`, a sum block), admin billing stat cards, DataTable's phone cards, the portal (public look), the placeholder box `email/templates/page.tsx:78`.

- [ ] **Step 3: Lint + build** — `npm run lint && npm run build`.

- [ ] **Step 4: Check in the browser** — open each of the five screens at 375px (label above value, nothing cut off, long values wrap) and 1280px (two columns, labels aligned), light + dark.

- [ ] **Step 5: Commit** — `detail-list.tsx` + the five pages ("DetailList: one layout for a record's facts, stacked on phones; replaces five hand-made dl grids").

---

### Task 4: Phones — floating glass tab bar (iOS style)

Agreed look (2026-11-15): a floating capsule with **three** tabs, Start · Suche · Menü, each with an icon and a small label below, roomy spacing. Next to it, a separate round button for the page's primary action. Four elements at most. Pages without a primary action show the capsule alone, centred. Sprout stays a round button in the top bar. Liquid-Glass look: blur plus saturation on a translucent background, a fine light top edge and a soft shadow. No SVG refraction filter (Safari doesn't support it).

**Files:**
- Create: `src/components/mobile-bar.tsx`
- Modify: `src/app/globals.css` (glass tokens + `.glass` class)
- Modify: `src/components/app-shell.tsx`, `src/components/command-search.tsx`, `src/components/page.tsx` (`PageHeader` primary), `src/components/save-bar.tsx` (`data-slot="save-bar"` on the page variant)
- Modify (if missing): `src/i18n/messages/de.json` / `en.json`, `common.menu` = "Menü" / "Menu"

**Interfaces:**
- Produces: `MobileBar()` (client, no props), rendered by `AppShell` only when `search` is true (the App, not `/admin`). Search opens on the `document` event `"roots:search"`. Hook attributes: `data-slot="mobile-bar"`, `data-slot="page-primary"` (the round button), `data-slot="save-bar"`, `data-own-tab-bar` (pages with their own bar, e.g. `/scan`). The bar's height, including its gap, is `--mobile-bar` on `SidebarInset`: `calc(4.75rem + env(safe-area-inset-bottom))` below `md`, `0px` from `md`.

- [ ] **Step 1: Glass tokens in `globals.css`** (not in `theme.css`: that file gets replaced by theme exports, so these tokens derive from it). `:root` / `.dark`:
  - `--glass: color-mix(in oklch, var(--background) 72%, transparent)`
  - `--glass-border: color-mix(in oklch, var(--foreground) 10%, transparent)`
  - `--glass-highlight`: light = `color-mix(in oklch, var(--background) 80%, transparent)`, dark = `color-mix(in oklch, var(--foreground) 14%, transparent)`

  Plus a class `.glass`: `background: var(--glass); border: 1px solid var(--glass-border); box-shadow: inset 0 1px 0 var(--glass-highlight), var(--shadow-lg); backdrop-filter: blur(20px) saturate(180%)`. Fallback: under `@supports not (backdrop-filter: blur(1px))` and `@media (prefers-reduced-transparency: reduce)`, the background becomes `var(--background)`.

- [ ] **Step 2: `MobileBar`.** A `nav` with `aria-label` and `data-slot="mobile-bar"`, `md:hidden fixed z-30 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-4`. Right edge: `right-4` with the capsule centred at `w-[78%]` when the page has no primary action; when it has one, `right-[calc(1rem+3.625rem+0.75rem)]` via `[body:has([data-slot=page-primary])_&]`, leaving room for the round button. The capsule is `glass rounded-full p-1.5 flex gap-1.5`. Three tabs (`flex-1 flex flex-col items-center gap-0.5 min-h-11 py-1.5 rounded-full text-[11px]`, icon `size-5`):
  - **Start**: `Link` to `APP_HOME`; `aria-current="page"` when active.
  - **Suche**: `document.dispatchEvent(new Event("roots:search"))`.
  - **Menü**: `useSidebar().setOpenMobile(true)`.

  The active tab has a pill (`bg-primary/10 text-primary`). The pill is one absolutely positioned element, moved with `translateX(index * 100%)` plus the gap, `transition-transform duration-300`, no measuring. Touch: `active:scale-95 transition`, `[-webkit-tap-highlight-color:transparent] touch-manipulation select-none`.
  **Shrinking while scrolling down:** a scroll listener (passive, rAF) sets `data-compact` on the bar after 24px of downward scroll and removes it on any upward scroll. Compact = only the active tab's icon, labels and the other tabs collapsed (`grid-template-columns` / `max-width` transition). Under `motion-reduce` there is no animation, the switch is instant.

- [ ] **Step 3: Primary action as the round button.** In `PageHeader`, a link-type `primary` keeps its place in the header from `md`. On phones it becomes the round button next to the capsule: `data-slot="page-primary"`, `max-md:glass max-md:fixed max-md:z-30 max-md:right-4 max-md:bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] max-md:size-[3.625rem] max-md:rounded-full max-md:p-0`, label `max-md:sr-only` (keeps its `aria-label`), icon `size-6`. ReactNode primaries stay inline.

- [ ] **Step 4: Hide when it would get in the way** (CSS only). The bar *and* `page-primary` get `max-md:hidden` when:
  - a SaveBar is on the page: `[body:has([data-slot=save-bar])_&]`, so the SaveBar takes the bottom;
  - an input is focused: `[body:has(input:focus,textarea:focus,select:focus,[contenteditable]:focus)_&]`, so nothing floats over the keyboard;
  - the page has its own tab bar: `[body:has([data-own-tab-bar])_&]` (set that attribute on the `/scan` bar, `scan/page.tsx:87`).

  Sheets cover the bar anyway (`z-50`).

- [ ] **Step 5: Wire it into the shell.** `CommandSearch` also opens on `"roots:search"`, next to the ⌘K listener. `AppShell` (when `search`):
  - Render `<MobileBar />` inside `SidebarInset` and set `max-md:[--mobile-bar:calc(4.75rem+env(safe-area-inset-bottom))]` on it.
  - `main` gets `max-md:pb-[calc(var(--mobile-bar)+1rem)]`; content scrolls visibly under the glass.
  - On phones, hide the top bar's `SidebarTrigger` and its separator (Menü lives in the bar now). `SproutButton` stays in the top bar on every size. `/admin` keeps everything as it is.

- [ ] **Step 6: Lint, build, browser.** Run `npm run lint && npm run build`. Then check at 375px with touch, in light and dark:
  - **Kontakte:** the capsule shows three spaced tabs and the "+" circle beside it; "+" opens the new-contact page; Start, Suche and Menü each work.
  - **Scrolling:** down shrinks the capsule to the active icon, up restores it.
  - **Start page (no primary):** the capsule is alone and centred.
  - **Contact page:** focus a field → bar and "+" disappear; change a field and blur → SaveBar at the bottom, no bar; Speichern → the bar is back.
  - **Content:** scrolls visibly blurred under the bar; the last list item is reachable above it.
  - **`/scan`:** only the Einlass tab bar.
  - **1280px:** no bar, "+" in the header as before.
  - **`/admin` at 375px:** top-bar trigger as before.

  As proof, screenshot Kontakte at 375px in light and dark.

- [ ] **Step 7: Commit** the files above: "Phones: floating glass tab bar (Start, Suche, Menü) with the page's primary action as a round button beside it, shrinks on scroll, hides for SaveBar/keyboard".

Not in this task: `viewport-fit=cover` and safe areas at the top only matter once roots can be added to the home screen as a web app (no manifest yet).

---

### Task 5: The binding UI guide `docs/design/app.md`

**Files:**
- Create: `docs/design/app.md`
- Modify: `AGENTS.md` (line 50 and lines 86–121), `CLAUDE.md`

**Interfaces:**
- Consumes: names from Tasks 1–4 (`ContentSheet compact`, `ContentSheetClose`, `DetailList`, `MobileBar`, `.glass`, `--mobile-bar`, `overlays.test.mjs`).

- [ ] **Step 1: Create `docs/design/app.md`**, sections in this order:
1. `# roots — App UI guide`: "Binding for every screen in the App and `/admin`. Read it before any UI change; new UI rules go here, not into AGENTS.md. The public site has its own sheet: `docs/design/site.md`."
2. `## Tokens and components`: AGENTS.md lines 87–92 verbatim.
3. `## Page anatomy`: lines 94–102 verbatim, except the **Drawers** bullet (→ section 4).
4. `## Overlays`: the exact text below.
5. `## Showing data`: the exact text below.
6. `## Phones first`: the exact text below.
7. `## Every device`: lines 104–121 verbatim; in "Destructive submits ask first" write "shows a compact bottom sheet" instead of "shows the dialog".
8. `## Drawer or page`: the "**Drawer or page:**" part of AGENTS.md line 50 (from "a record with real content" to "…to keep other params."), without the `<UrlDialog>` sentence.

```markdown
## Overlays

Everything that lies over a page rises from the bottom: one sheet, one look (`<ContentSheet>`). It sits over the
content area (not over the sidebar or Sprout), below the top bar, with rounded top corners, a sticky title bar (title,
actions, ⋯ left; X right), a light dim behind it and no blur. Phones: full width, a grab handle, swipe down to close.

| Need | Use | Never |
|---|---|---|
| Edit a small record, quick create, import, connect something | `<UrlSheet params>` (`?edit=<id>`, `?new=<thing>`, `?connect=<key>`), `wide` for imports/previews | a centred dialog, a side sheet |
| A sheet that only lives in client state (a value shown once, a quick create inside a picker) | `<ContentSheet>` (`compact` when short); buttons that close it are `<ContentSheetClose>` | `ui/sheet`, `ui/dialog` |
| Yes/no before something destructive or expensive | `data-confirm="<key>"` on the submit button → `<ConfirmHost>` (compact sheet) | an own dialog, `window.confirm` |
| Pick a value next to a field (date, icon, emoji, share settings) | a popover anchored to its trigger | a sheet |
| A record with real content (related lists, notes, files, preview) | its own page `/<area>/<id>` | a big sheet |

A `<UrlSheet>` reads top to bottom: `title`; `meta` (one small muted line: created…, live save status); the action row
(`actions` = the main action, `menu` = ⋯ with the red delete item last); the record's facts (`<DetailList>`); the form
with `<SaveBar>` at the bottom; related lists; activity. Closing in any way (X, Escape, backdrop, swipe) asks first when
the form has unsaved changes, then drops its params (and `ok`/`error`) from the URL. Quick creates that only need a
name stay sheets and then open the record.

One sheet at a time. Only a confirmation, or a quick create started inside it, may lie on top.

Fixed exceptions: ⌘K search (`CommandDialog`, a centred palette), the phone navigation (the sidebar's own sheet),
Sprout (a panel in the layout), `window.confirm` when leaving a page with unsaved changes (must answer synchronously),
`window.prompt` for link/image URLs in the rich-text and wiki editors (to be replaced by a popover).
`src/components/overlays.test.mjs` fails when code outside `src/components/ui/` imports `ui/dialog`, `ui/sheet` or Base
UI's dialog/drawer. A new exception goes into that test's allowed list *and* into this list.

## Showing data

- **A record's facts** (status, amounts, dates, people, references): `<DetailList items>` — label above value on
  phones, two aligned columns from `sm`, empty values show "–". Never a hand-made `<dl>` grid.
- **At a glance** (status, what's due): in the header (`badge`, `meta`) of the page or sheet, so it is the first thing
  on a phone, not inside a list further down.
- **Rows** (order items, participants, payments of a record): `<DataTable>` (cards on phones), also inside sheets.
- **Contact data is actionable**: emails as `mailto:`, phone numbers as `tel:`, URLs as links (new tab), so a tap on
  a phone calls or writes.
- **Money** right-aligned with `tabular-nums` in tables, `t.money()`; dates via `t.date()`.
- **Long text / HTML**: rendered rich text or a sandboxed preview (`<PaperPreview>`), never raw stored HTML.
- **Wide things** (timelines, previews, big tables) scroll inside their own box (`overflow-x-auto`), never the page.

## Phones first

The App is used on the go (door, shifts, looking someone up), so phones are a first-class device, not a squeezed
desktop. Build the phone layout first, then add `sm:`/`md:`/`lg:`.

- **Thumb zone**: on phones a floating glass tab bar (`<MobileBar>`, iOS style) holds the global ways around: a
  capsule with Start · Suche · Menü, and next to it the page's one primary action (`PageHeader` `primary`) as a round
  button. Never more than four elements; a new tab only replaces one. Sprout stays in the top bar. Everything else
  stays in the header and its ⋯ menu. The capsule shrinks to the active tab while scrolling down, and the bar hides
  while a SaveBar shows or an input has focus. Content scrolls under the glass; space below it comes from
  `--mobile-bar`. Glass = the `.glass` class (tokens in `globals.css`, derived from the theme), with a solid
  fallback for "reduce transparency".
- **Phone-critical flows** (check these at 375px first, with touch): Einlass/Scan, Meine Schichten incl. clock in/out,
  looking up a contact and calling/mailing them, tasks, notifications, Sprout.
- **Sheets**: full width, from below the top bar; swipe down closes; the focused field stays above the keyboard;
  the SaveBar sticks to the bottom above the home indicator.
- **Buttons in short sheets** stack full width on phones, main action at the bottom (closest to the thumb):
  `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`.
- **Touch**: nothing only on hover — whatever appears on hover is also in a ⋯ menu or visible; touch targets at least
  `size-8`, bar items and the primary action at least 44px high.
- **Inputs** keep the shadcn sizes (`text-base` on phones), so iOS doesn't zoom; use `<TypedInput kind>` so phones get
  the right keyboard (numbers, email, phone).
- A page with its own bottom tab bar (Einlass) marks it `data-own-tab-bar`; the App bar then hides instead of adding a second one.
```

- [ ] **Step 2: Shrink `AGENTS.md`** — delete lines 86–121 (`## Design system` … "Check new screens at 375px, 768px and 1280px before committing.") and put in their place:

```markdown
## UI
**Before any UI change read `docs/design/app.md`** (tokens, page anatomy, overlays, showing data, phones first, every device). It is the binding UI guide; new UI rules go there, not here.
```

On line 50 keep the first sentence (`<DataTable>`, `<SearchBox>`, `<Pager>`) and replace the rest of the bullet with `Drawer or page, and which overlay for what: docs/design/app.md.` Leave lines 1–9 (generated by `next dev`) untouched.

- [ ] **Step 3: `CLAUDE.md`** — add the line `@docs/design/app.md` below `@AGENTS.md`.

- [ ] **Step 4: Verify nothing was lost**

```bash
for p in "Page size" "PageHeader" "RecordLayout" "SaveBar" "TypedInput" "FilterMenu" "Area settings" "AppShell" "CalendarView" "Pager" "RichTextEditor" "TagSelect" "DataTable" "flex flex-wrap" "max-w-5xl" "Global search" "Navigation" "SubmitButton" "data-confirm" "Tooltip" "375px" "theme.css" "lucide-react" "UrlSheet" "DetailList" "MobileBar"; do grep -q "$p" docs/design/app.md || echo "MISSING: $p"; done; grep -n UrlDialog AGENTS.md docs/design/app.md
```

Expected: no output.

- [ ] **Step 5: Commit** — `docs/design/app.md`, `AGENTS.md`, `CLAUDE.md` ("UI guide: docs/design/app.md is the binding App UI reference (overlays, showing data, phones first), loaded via CLAUDE.md, pointed to from AGENTS.md").
