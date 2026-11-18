# roots on phones — feel like a native app

Binding for every App screen below `md` (768 px). Complements `docs/design/app.md` ("Phones first"). Reference feel:
iOS apps (Mail, Things, Linear mobile, Shopify mobile): one thing per screen, big touch targets, sheets from the
bottom, the thumb does everything, nothing jumps.

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

## 2. Overlays on phones

| Desktop | Phone |
|---|---|
| ⋯ dropdown menu, any `DropdownMenu` | **action sheet**: bottom sheet with big rows (h-12, icon + label), destructive last and red, Abbrechen at the bottom |
| popover (date picker, filters, share, emoji) | bottom sheet with the same content |
| `<FilterMenu>` dropdown | bottom sheet with the options as rows / checkboxes, "Fertig" button |
| `<UrlSheet>` / `<ContentSheet>` | full width, from 2.5 rem below the top, grab handle, swipe down, SaveBar sticky at the bottom above the home indicator and the keyboard |
| tooltip | nothing (labels must be visible or in `aria-label`) |
| ConfirmHost | compact sheet, buttons stacked full width, the action at the bottom |

One shared way: menus and popovers get a phone variant that renders through `<ContentSheet compact>` below `md`
(`useIsPhone()` / the same media query as `<HeaderActions>`), so pages don't build two UIs.

## 3. Screens

- **Lists**: `<DataTable>` cards — whole card tappable (≥ 56 px high), title + status badge on line 1, one muted line
  (date/amount) on line 2, chevron right. Toolbar: search field full width, then one row of `<Segments>` / filter chips
  that scrolls horizontally (never wraps into three lines). Pagination as "Mehr laden" at the end.
- **Record pages**: header facts (badge, meta), `<Stats>` 2 per row, the next step as the round button, then sections.
  The edit form is in the "Bearbeiten" sheet, not between the facts and the lists. Sub-views (Event › Tickets) as a
  horizontally scrolling `<Segments>` row, sticky under the top bar.
- **Forms**: one column, label above the field, fields `h-11` on phones, 16 px text (global rule), the right keyboard
  (`<TypedInput kind>`: `inputMode`, `autoComplete`, `enterKeyHint`), the SaveBar as the only button. Long forms are
  sections; rarely used fields behind "Mehr Angaben" (progressive disclosure).
- **Boards / calendars / timelines**: boards scroll horizontally one column at a time (snap), calendars default to the
  list or day view on phones, timelines scroll in their own box.
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

1. Shell (one pass): top bar back chevron + phone ⋯ collecting `<HeaderActions>`, search sheet, Menü dot + inbox row,
   phone variants for `ActionsMenu`/`DropdownMenu`/`Popover`/`FilterMenu` as action sheets, list toolbar scroll row,
   `overflow-x: clip`, hover-only fixes in shared components.
2. Every area pass of `docs/plans/ux-overhaul.md` applies §3–§5 to its screens.
