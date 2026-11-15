# roots — App UI guide

Binding for every screen in the App and `/admin`. Read it before any UI change; new UI rules go here, not into AGENTS.md. The public site has its own sheet: `docs/design/site.md`.

## Tokens and components
- Theme tokens live in `src/app/theme.css` (`:root` + `.dark`, oklch, radius, shadows). Switching themes = replace that file with a tweakcn/shadcn export. Change the look there, not per-component.
- Use semantic classes only: `bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`… **No raw colors** (`bg-blue-500`, hex) in components.
- Radius via `rounded-md/lg/xl` (derived from `--radius`). Spacing on Tailwind scale.
- Compose from `src/components/ui/*`; app-level components go in `src/components/`. Use `cn()` from `@/lib/utils` for class merging.
- Icons: `lucide-react` only. Exception: logos of third-party apps (Claude, Cursor, VS Code …) as SVGs in `public/brands/`.
- Accessible basics: labels on inputs, focus rings intact, real `<button>`/`<a>`.

## Page anatomy (same on every screen, see /style/app)
- **Page**: `<Page size="list|record|form">` (6xl lists/boards/records, 3xl forms/settings/new). Area layouts use the list width.
- **Header**: `<PageHeader>` on every page: `area` (icon from the nav) or `crumbs` (record pages), `title`, `badge`, `meta` (one muted line), `description`. Right side, always in this order: `settings` (gear → the area's Einstellungen), `actions` (few outline buttons), `menu` (`<ActionsMenu>` ⋯: import, export, trash view, duplicate, delete), `primary` (the one filled button, "+ New …", key N). Delete/trash is always a red (`destructive`) ⋯ item with the trash icon, posting a hidden `<form id=…>` via `<MenuSubmit form>`; no danger-zone boxes.
- **Records**: `<RecordLayout aside>`: content left, details/related cards right. Group fields in `<FormCard title description>` by topic (Person, Adresse, Bank & SEPA…), never a flat list of 15 inputs.
- **Saving**: no save buttons on edit forms. Put `<SaveBar />` inside the form: a full-width bar appears at the bottom once something changed (Abbrechen · Speichern) and leaving asks first. Create forms: `<SaveBar label="… anlegen" always />`. Small inline things (status, checklist, tasks) autosave. Exception: lists of inline-editable rows (positions, columns, locations) keep a small button per row.
- **Inputs**: `<TypedInput kind="iban|bic|postcode|phone|email|url|money|number|date">` (keyboard, autofill, placeholder, width, format + check on leaving; money posts "1.234,50" → `moneyCents()`), the server checks again with `src/lib/inputs.ts` (`ibanValid` with check digits, `bicValid`, `moneyCents`). One value from a list: `<Choice>` (≤ 5 segments, ≤ 15 dropdown, more = search). Booleans in forms: checkbox (`accent-primary`).
- **Lists**: toolbar = `<SearchBox>` + `<FilterMenu>` dropdowns (tags, status, type, event…) + `<Segments>` for ≤ 5 views (Kommend · Vergangen · Alle, Board · Liste). Trash is a ⋯ item, not a filter chip. Lists that have never had a row show `<EmptyState area title text action>`.
- **Area settings**: always the area's last sidebar item "Einstellungen" (`common.settings`) at `/<area>/settings`; Settings › Bereiche lists them all. Org-wide settings only under `/settings`.

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

Fixed exceptions: ⌘K search (`CommandDialog`, a centred palette), the phone menu (`<MobileMenu>`, a bottom sheet),
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
  stays in the header and its ⋯ menu. The capsule shrinks to the active tab while scrolling down, and the bar and the
  round button hide (`@utility bar-hide` in `globals.css`) while a SaveBar shows, an input has focus or the page marks
  its own tab bar. Content scrolls under the glass; space below it comes from `--mobile-bar`. Glass = the `.glass`
  class (`@utility glass` in `globals.css`, derived from the theme tokens), with a solid fallback for "reduce
  transparency". While the bar is hidden by a SaveBar or a page's own tab bar, the top bar shows the menu button
  (`@utility bar-fallback`), so phones never lose the menu.
- **Menü** opens a bottom sheet, not the sidebar, with no title row and no X (grab handle, swipe or backdrop close it): the org switcher only when there is more than one org to choose (several orgs or a platform admin), search on top, the nav areas as a 3-column tile grid (icon + label, active area tinted), an area with sub-pages drills into big rows (back = ‹ Menü), account rows at the bottom; it always opens at the tiles, never drilled into the current area. Same `groups` as the sidebar (`<MobileMenu>`), so new modules appear automatically.
- **Phone-critical flows** (check these at 375px first, with touch): Einlass/Scan, Meine Schichten incl. clock in/out,
  looking up a contact and calling/mailing them, tasks, notifications, Sprout.
- **Sheets**: full width, from below the top bar; swipe down closes; the focused field stays above the keyboard;
  the SaveBar sticks to the bottom above the home indicator.
- **Buttons in short sheets** stack full width on phones, main action at the bottom (closest to the thumb):
  `flex flex-col-reverse gap-2 sm:flex-row sm:justify-end`.
- **Where am I** is the top bar (area › page). On phones `<PageHeader>` drops its crumb row and area icon, and area pages their title (kept for screen readers); record pages keep the record title. Don't add a second title or crumb line inside pages. The header's gear / actions / ⋯ move into the top bar next to Sprout on phones (`<HeaderActions>` portals into `#topbar-actions`); the primary action is the round button by the tab bar.
- **Bulk actions** (tick boxes + bulk bar) are tablet/desktop only: `<DataTable>` cards on phones have no tick boxes, so anything a bulk action does must also be possible on the single record.
- **Touch**: nothing only on hover — whatever appears on hover is also in a ⋯ menu or visible; touch targets at least
  `size-8`, bar items and the primary action at least 44px high.
- **Inputs** keep the shadcn sizes (`text-base` on phones), so iOS doesn't zoom; use `<TypedInput kind>` so phones get
  the right keyboard (numbers, email, phone).
- A page with its own bottom tab bar (Einlass) marks it `data-own-tab-bar`; the App bar then hides instead of adding a second one.

## Every device
Every screen works on phone (from 360px), tablet (iPad, `md` = 768px+) and desktop, in light + dark. Same components, same tokens; only the arrangement changes.
- Mobile-first classes: base = phone, add `sm:` / `md:` / `lg:` for wider. No fixed widths that can overflow; text truncates or wraps.
- Signed-in areas use `<AppShell>` (`src/components/app-shell.tsx`, App + `/admin`): shadcn sidebar = drawer on phones, collapsible to icons (with tooltips) from `md`. Nav items need a lucide icon (`icon` in the module registry).
- Calendars: `<CalendarView>` (`src/components/calendar-view.tsx`, wraps the vendored ReUI event calendar in `src/components/reui/`): month / week / day / list / per-person views, view + date in the URL, click → `href` (drawer), empty slot click (`newMinutes` long) or drag across a range → `newHref` with `start`/`end`, optional drag via a server action. Use it for anything with dates (shifts, events, bookings) instead of building grids.
- No fixed row limits in the UI: lists paginate on the server (`<Pager>`), pickers search on the server (`<ContactPicker>` + a `search*` server action, 20 results per query). Never load "all" rows into a select.
- Rich text anywhere: `<RichTextEditor name defaultValue placeholders?>` (`src/components/rich-text-editor.tsx`, Tiptap) posts HTML like a normal input. Never render stored HTML in the app outside a sandboxed iframe.
- Tags: pick them with `<TagSelect name options defaultValue creatable?>` (chips, not typing); the org's tags come from `rpc("contact_tags")`.
- Lists: `<DataTable>` shows cards on phones (first column = title, others label/value) and a table from `md`. Keep the first column meaningful.
- Drawers (`<UrlSheet>` / `<ContentSheet>`) are full-width on phones. Forms stack on phones: `grid gap-4 sm:grid-cols-2`.
- Toolbars and page headers wrap: `flex flex-wrap items-center gap-3`.
- Pages are left-aligned (same left margin everywhere): `grid max-w-5xl gap-6`, never `mx-auto` in the App/admin. Popovers from the sidebar open below/above their trigger, as wide as the sidebar.
- **Global search (⌘K, `src/search/actions.ts`)**: every new module/record type adds its source there, and every hit is a **deep link to the record itself** (its page, or its drawer via `?edit=<id>`, a wiki page, a file), never just the list. Pages come from the nav tree (`src/modules/nav.ts`).
- **Navigation**: the sidebar is the tree in `src/modules/nav.ts` (areas with sub-pages, only the current area expanded, the first sub-page is "Übersicht" when it is the area itself). New sub-page = an entry there, not a tab bar in the layout. Records with real content are pages (`/<area>/<id>`), and so is creating them (`/<area>/new`, `<NewPage>`); drawers only for quick edits with a few fields and for imports (wide `<UrlSheet wide>` on the overview).
- Feedback on every action: form buttons are `<SubmitButton>` (or the `<SaveBar>`) (`src/components/submit-button.tsx`: spinner + disabled while the server action runs), navigation shows the area's `loading.tsx` skeleton, client-side work (`useTransition`) disables its trigger and shows a pending label. Never a plain `<Button type="submit">`.
- Destructive submits ask first: `data-confirm="<message key>"` on the button (`<ConfirmHost>` in the App shell shows a compact bottom sheet, `{count}` = ticked ids, optional `<key>Hint` line). `<MenuSubmit destructive>` does it by default (trash question), bulk-bar trash buttons use `common.confirmTrashMany`.
- Icon-only buttons get a `<Tooltip>` and an `aria-label`. Touch targets at least `size-8`.
- Check new screens at 375px, 768px and 1280px before committing.

## Drawer or page

A record with real content (related lists, notes, files, a preview – more than a short form) gets its own page `/<area>/<id>` with `<PageCrumbs>` (`src/components/page-crumbs.tsx`, e.g. Kontakte › Erika Muster) and `#anchor` sections; small records (settings-like rows, a few fields) open in a drawer: row links to `?edit=<id>`, which renders `<UrlSheet params={["edit"]}>` with the edit form. When a drawer record becomes a page, redirect its old `?edit=<id>` links. "New" = `?new=<thing>` + `<UrlSheet>`. Build links with `withParams(sp, {...})` to keep other params.
