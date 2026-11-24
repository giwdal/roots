# roots on phones — feel like a native app

Binding for every App screen below `md` (768 px). Complements `docs/design/app.md` ("Phones first"). Reference feel:
iOS apps (Mail, Things, Linear mobile, Shopify mobile): one thing per screen, big touch targets, sheets from the
bottom, the thumb does everything, nothing jumps.

## 0. Phone and desktop are designed separately

When a screen's job differs by device, build each layout for its device (see `ux-overhaul.md` §1b, Einlass as the
example). A desktop page must not carry phone-only workarounds, and a phone screen must not be a shrunken desktop.

## 1. The shell (keep what works)

The tab bar + Menü sheet stay as they are in spirit (capsule Start · Suche · Menü + the round primary button; the Menü
sheet with area tiles and drill-down). What changes:

- **Top bar = where you are + one way back.** Left: a back chevron to the parent (the record's crumb or the area)
  whenever you're deeper than an area page; then the title (one line, truncates). Right: at most **two** icons:
  the page's ⋯ (which on phones also holds the gear and every header `action`) and Sprout. No row of buttons in the
  top bar on phones — `<HeaderActions>` collapses into the ⋯ action sheet below `md`.
- **Menü tab shows a dot** when the inbox has unread items; the inbox is the first row in the Menü sheet.
- **Suche opens a full-screen sheet**, not the centred ⌘K dialog: input at the top (16 px, autofocus, `enterkeyhint="search"`),
  recent records below it, results grouped by area with `<AreaIcon>`. The keyboard never pushes the page sideways.
- **Toasts** at the top (already), never covered by the tab bar or the keyboard.

How it is built (done, shell pass):
- Back + title: `<TopbarTitle>` (`topbar-crumbs.tsx`). A page gets its back target from `<PageHeader crumbs>` (the
  nearest crumb with an `href` before the last); without crumbs, a path deeper than a nav page (`/shop/orders/<id>`)
  goes back to that page. Give record pages `crumbs` with hrefs; nothing else is needed.
- The ⋯: `<PageHeader>` renders `<PhoneMenu>` below md through `<HeaderActions phone>`. Header `actions` become
  full-width rows (buttons, links, forms keep their behaviour; labels hidden with `max-md:sr-only` show again), the
  `<ActionsMenu>` items render as rows through a context (`MenuLink` / `MenuSubmit` / `MenuDownload` / `MenuGroup` /
  `MenuExport` / `MenuSeparator` only – no raw `DropdownMenuItem` in an `ActionsMenu`). Controls that are not actions
  (a month switcher) belong in the page toolbar, not in `actions`.
- Primary on phones: a link primary is the round button; a form-button primary (Jetzt senden, Veröffentlichen,
  Ausstellen) is the round button too when it has an icon (label for screen readers only) and also stays in the ⋯
  sheet, because a SaveBar hides the round button. Give such buttons an icon.
  A page that shows its form-button primary itself as a full-width labelled button under the header (invoice, shop
  order) passes `primaryInPage`: then no round button and no copy in the ⋯ sheet, so the action appears once.
- Search: `<CommandSearch>` renders a `<ContentSheet>` on phones (field + Abbrechen on top, recents from this browser,
  results with the area's `<AreaIcon>`); the Suche tab focuses a stand-in field during the tap so iOS opens the
  keyboard. `body { overflow-x: clip }` on phones stops the sideways shift.
- Keyboard: `<KeyboardInset>` writes the keyboard's height into `--keyboard`; the page SaveBar sits at
  `bottom: var(--keyboard)` and `scroll-padding-bottom` keeps the focused field above it.

## 2. Overlays on phones

| Desktop | Phone |
|---|---|
| ⋯ dropdown menu, any `DropdownMenu` | **action sheet**: bottom sheet with big rows (h-12, icon + label), destructive last and red, Abbrechen at the bottom |
| popover (date picker, filters, share, emoji) | bottom sheet with the same content |
| `<FilterMenu>` dropdown | bottom sheet with the options as rows / checkboxes, "Fertig" button |
| `<UrlSheet>` / `<ContentSheet>` | full width, from 2.5 rem below the top, grab handle, swipe down, SaveBar sticky at the bottom above the home indicator and the keyboard |
| tooltip | nothing (labels must be visible or in `aria-label`) |
| ConfirmHost | compact sheet, buttons stacked full width, the action at the bottom |

One shared way, so pages don't build two UIs (`usePhone()` in `src/lib/use-phone.ts` when code must differ):
- Every `DropdownMenuContent` is an action sheet below `md` by itself (CSS `[data-phone-sheet]` in `globals.css`:
  pinned to the bottom, dim backdrop, grab handle, rows `min-h-12`, "Abbrechen" added at the end). Same Base UI
  menu, so items, `data-confirm` and `MenuSubmit` work unchanged. `title` heads the sheet (FilterMenu passes its
  label); `sheet={false}` opts out (the round primary button's small glass menu).
- Pickers: `<PopoverContent sheet title>` (date input, wiki icon + share, product image pick). Popovers that are not
  pickers stay anchored.
- The header's ⋯ is a `<ContentSheet compact>` (`<PhoneMenu>`), because it also holds arbitrary header actions.

## 3. Screens

- **Phone list rows carry at most three things** (user, 19 Nov): the title, one muted line (status badge + the
  one fact that decides the next tap, e.g. who rents it / since when), and one short value on the right (amount with
  its unit stacked underneath). Kind, deposit, secondary dates stay on desktop and on the record.
- **Lists**: `<DataTable>` cards — whole card tappable (≥ 56 px high), title + status badge on line 1, one muted line
  (date/amount) on line 2, chevron right. Toolbar: search field full width, then the `<Segments>` view switch full width (every
  view visible, equal parts), filter buttons wrapping below — nothing scrolls sideways or gets cut off (user, 19 Nov). Pagination as "Mehr laden" at the end.
- **Record pages**: header facts (badge, meta), `<Stats>` 2 per row, the next step as the round button, then sections.
  The edit form is in the "Bearbeiten" sheet, not between the facts and the lists. Sub-views (Event › Tickets) as a
  horizontally scrolling `<Segments>` row, sticky under the top bar.
- **Forms**: one column, label above the field, fields `h-11` on phones, 16 px text (global rule), the right keyboard
  (`<TypedInput kind>`: `inputMode`, `autoComplete`, `enterKeyHint`), the SaveBar as the only button. Long forms are
  sections; rarely used fields behind "Mehr Angaben" (progressive disclosure).
- **Boards / calendars / timelines**: boards show one column at a time (snap) with column chips above (name + count,
  tap = jump, the active one marked; `projects/board.tsx`); calendars are `<PhoneCalendar>` inside `<CalendarView>`
  (iOS / Google Calendar: week strip Mo–So with dots, swipe or arrows, Woche · Monat with a dotted month grid, the
  selected day's entries below, "+" creates on that day through the page's `newHref`); timelines scroll in their own box.
- **Check-lists on the go** (attendance, later guest lists at a table): one big row per person (≥ 48 px), a tap
  toggles and saves at once (no save button), a counter "8 von 12 da" + "Alle da" above, ‹ › to the previous / next
  date in a toolbar row (`courses/attendance-list.tsx`).
- **Wide content** (tables with many columns, previews) scrolls inside its own box; the page never scrolls sideways.

## 4. Touch rules

- Targets ≥ 44 px (bars, rows, primary actions), ≥ 32 px for secondary icon buttons with spacing between them.
- Every interactive element has a pressed state (`active:bg-muted` / `active:scale-95`), `touch-manipulation`, no
  tap highlight. Nothing only on hover: hover-only buttons (remove ✕ on chips, row actions) are always visible on
  touch (`[@media(hover:none)]:opacity-100`) or live in the row's ⋯.
- No double-tap zoom, no input zoom (16 px rule), never disable pinch zoom.
- Respect safe areas (`env(safe-area-inset-*)`) in bars, sheets and the SaveBar; `viewport-fit=cover` is on.
- Scroll: `overscroll-contain` in sheets and side boxes, so the page behind never moves; the page itself never
  scrolls horizontally (`overflow-x: clip` on the content area as the safety net).
- Motion: sheets slide (200 ms, iOS easing), the tab bar shrinks on scroll, everything respects `prefers-reduced-motion`.

## 5. Checks before a screen is done

At 375 × 667 and 390 × 844, light and dark, with the keyboard open: nothing overflows sideways, the main action is
reachable with the thumb, the focused field stays visible above the keyboard, the SaveBar sits above the keyboard,
every overlay closes by swipe/back, the top bar shows where you are and how to go back.

## 6. Work

1. Shell (one pass, done): top bar back chevron + phone ⋯ collecting `<HeaderActions>`, search sheet, Menü dot + inbox
   row, phone variants for `ActionsMenu`/`DropdownMenu`/`Popover`/`FilterMenu` as action sheets, list toolbar scroll
   row (`<Segments>` scrolls itself; `<ListToolbar>` for whole toolbars, adopted per area), `overflow-x: clip`,
   hover-only fixes in shared components. Not done here: swipe-to-close on dropdown sheets (backdrop / Abbrechen close
   them), "Mehr laden" pagination, DataTable card redesign (area passes, §3).
2. Every area pass of `docs/plans/ux-overhaul.md` applies §3–§5 to its screens.
