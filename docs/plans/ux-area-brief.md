# Brief for an area pass of the UX overhaul

You redesign one area of the roots App. UX and UI are the priority; every feature must keep working.

## Read first (all binding)
AGENTS.md · docs/design/app.md · docs/design/patterns.md (screen types, settings as grouped rows, how to show/enter
each kind of information, when menus, §7 navigation + target sidebar) · docs/design/mobile.md (phone concept and what
the shell already does) · docs/plans/ux-overhaul.md (§1 simple first, §1b rethink per device + written spec, §6b module
connections, glossary). Then your inventory `docs/ux-map/<area>.json`. Reference implementations: Events
(src/app/(app)/events/**, scan/**) and Shop (src/app/(app)/shop/**), with their `redesign` objects in
docs/ux-map/events.json and shop.json. Next.js in this repo differs from your training data: check
node_modules/next/dist/docs/ when unsure.

## Building blocks (use them; promote a page-local one to src/components/ when you reuse it, keep imports working)
- src/components: section.tsx (Section, AddLink, RowGroup, SettingRow), stats.tsx, area-icon.tsx, record-picker.tsx,
  contact-picker.tsx, choice.tsx (Choice, SegmentGroup/Segment), segments.tsx, data-table.tsx (DataTable, ListToolbar,
  SearchBox, Pager — the first column is already a link: no links inside it), ui/switch.tsx, ui/badge.tsx (status
  variants success|warning|info|destructive, never default for a status), typed-input.tsx, date-input.tsx,
  url-sheet.tsx, save-bar.tsx, actions-menu.tsx (MenuLink/MenuSubmit destructive+confirm), PopoverContent `sheet`,
  src/lib/use-phone.ts.
- From earlier passes: shop/badges.tsx (status → colour), shop/settings/setting-switch.tsx (switch that saves on flip),
  shop settings layout (rows + `?edit=<part>` sheet per text value), shop/[id]/picture-add.tsx (tap → upload),
  shop/[id]/variant-rows.tsx and events/[eventId]/tickets/tier-rows.tsx (inline rows saved with the record's SaveBar),
  shop/stock-sheet.tsx (one sheet used from list and record), the order page's next-step button + progress row,
  the `?contact=` filter chip + the module's rows on the contact page, lineup/artist-field.tsx (RecordPicker with
  create-from-typed-name), the `gear: true` flag in src/modules/nav.ts (settings reachable by gear, not in the sidebar).
- From Finanzen: components/link-rows.tsx (`<LinkRows>`: the "Verknüpft" section of a record, icon · title · detail ·
  badge ›), `<SaveBar confirm="<key>">` (a save that asks first: book, close a month), payments/badges.tsx +
  invoices/badges.tsx (payment / document status → colour), a header form button that submits the page's form with
  `form="<id>" formAction={…}` (Ausstellen = save + issue), invoices/new (the record's editor on /new, created on save),
  `<NumberRangeFields suffix>` (number ranges inside a bigger form), reports/period-menu.tsx (presets as a dropdown).
- From Kontakte + Mitglieder: the contact page as the Person hub (add your module's rows there as a `<Section>` with
  `<LinkRows>`, hidden when off/empty), members/badges.tsx (membership state + due status → colour),
  components/custom-field-details.tsx (`customDetails()`: custom field values as DetailList items), `<Choice emptyLabel>`
  (the "automatic / as the type" option named), a `<details>` "… (optional)" section on /new pages for rarely needed
  cards, a record's own fields in a `?edit=details` sheet with errors sent back to `?edit=details`, record row actions as
  one visible button + a row `<ActionsMenu>` of `MenuSubmit`s on hidden forms, a money flow as numbered steps
  (Beiträge › Lastschriften), `/email/log?contact=`.
- From Kommunikation + Gästelisten: email/views.tsx (`<EmailViews>`: sibling routes as one area's view Segments in the
  toolbar), email/badges.tsx + forms/badges.tsx (campaign / send / form / submission status → colour), forms/[id]/element-rows.tsx
  (inline rows kept in client state and posted as one hidden JSON input, ↑ ↓ reorder, ✕ with confirm, "+ Element"
  dropdown; pure `readElements()` + `checkElements()` on the server), forms/[id]/header.tsx (`formHeader()`: one record
  header + sub-view Segments rendered by each sub-page so each can set its own primary), a header button that saves
  and changes state with `form="<id>" name=… value=…` (Veröffentlichen, Jetzt senden), `data-confirm-count` with a
  server-known number (recipients), server-search pickers `searchEvents` (email) / `searchListEvents` +
  `searchListArtists` (guestlists), `?edit=list` vs `?edit=<row id>` on one record page (record fields vs a row's
  sheet), the area settings page as RowGroups of record rows › + AddLink (email/settings), Settings › Bereiche lists
  nav children with `gear: true`.
- Confirm = `data-confirm="<key>"` (+ `<key>Hint`) on any button/link. `<PageHeader crumbs>` with hrefs (phone back
  chevron). Header settings/actions/menu go into the phone ⋯ automatically; non-action controls (month navigation,
  filters) belong in the page toolbar.

## Process
1. Research briefly how the best tools in the space do it (WebSearch/WebFetch ok) and take the simplest pattern.
   Per screen: one thing to look at, one main action, ≤ 2 visible secondary, the rest in ⋯ or one level deeper.
2. Spec first: a `redesign` object { job, phone, desktop, moves[] } on every page in your map file; `moves` lists
   EVERY field / button / input / menu item / overlay / link from the map and where it lives now (or "removed: reason").
   Commit.
3. Build, page by page, phone and desktop each at their best. Record pages open on their state (badge, Stats, next
   step as primary, sections); editing in a sheet or calm grouped form; one form + one SaveBar per screen; switches
   save on flip; confirmations on every risky action; server-search pickers instead of big selects; money via
   TypedInput; DetailList for facts; EmptyState with action; ExportMenu where people take data to Excel; sidebar per
   patterns.md §7 (update src/modules/nav.ts for your area only; old URLs redirect); `?edit=`/`?new=` params, trash
   `?trash=1`; connections per ux-overhaul.md §6b in both directions (a filter param on the other list + a link is fine).
4. Keep server actions, src/api endpoints, MCP and DB behaviour working; no schema change unless unavoidable
   (AGENTS.md migration rules); no new dependencies.

## Rules
No hardcoded UI text (de.json + en.json). Comments describe what code does (no changelog comments). No AI attribution.
Don't run the dev server or `next build`. Before each commit: `npx tsc --noEmit -p .`, `npm run lint`, `npm test` pass.
Commit in between (spec, then per page group, then docs); `git commit` only, never push, only `git add` your own files.
At the end mark done items in your map file (`uxNotesDone`, redesign built) and reply with: commits, per page what
changed, what you decided not to do and why, reusable pieces for the next areas.
