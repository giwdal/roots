# Brief for an area pass of the UX overhaul

You redesign one area of the roots App. UX and UI are the priority; every feature must keep working.

## Read first (all binding)
docs/design/system.md (sizes `--control`, spacing, type, icons, buttons for phone/tablet/desktop) · patterns.md §8
(record pages: identity header, main + right rail, **inline editing** with `<InlineField>` + a `patch<Entity>` server
action per record type) · docs/plans/ux-backlog.md (open cross-cutting tasks; tick what you do, add what you find) ·
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
- From Schichten + Personal: components/time-input.tsx (`<TimeInput>`: 24 h time of day, typed, posts "HH:MM"),
  `<MenuSubmit count>` (a server-known number in the ⋯ item's confirm: "Serie und 12 zukünftige Schichten löschen?"),
  components/time-entries.tsx `<TimeEntrySheet>` (one sheet for an entity used on several pages: params, SaveBar,
  delete in ⋯), hr/absence-sheet.tsx (same, with a read-only mode for view-only people), shifts/views.tsx +
  hr/views.tsx (a personal view "Meine" / another view "Organigramm" as Segments), the Jetzt card on Schichten › Meine
  (the phone's one main action as a big full-width button in the page, not the round +), a next-step row with the
  confirm count (Stunden › Person: "3 Einträge offen · Monat freigeben"), shifts/settings/position-rows.tsx (inline
  rows posted by index like tier-rows, one SaveBar, ✕ asks for saved rows), weekday toggles (checkboxes styled as one
  segmented row), server-search pickers with a bound argument (`searchStaff.bind(null, positionId)` marks people not
  set up for the position), `searchTeamCandidates` / `searchMembers` (org members not yet on the team / in HR),
  `searchEmployees`, `searchProjects`, `searchShiftEvents`; the first record page on patterns.md §8: hr/[id] with
  Eigenschaften as `<InlineField>`s + `patchEmployee` (one field checked with the whole record's `read…()` rules), a
  small `?edit=links` sheet for relations and `?edit=private` for a compound value; `?user=<id>` pre-picks a member
  in create sheets (Meine → "Mich zum Team hinzufügen", HR → "Zum Schicht-Team hinzufügen").
- From Projekte + Kalender: components/phone-calendar.tsx (every `<CalendarView>` on phones, nothing to do per page:
  pass `newHref` and the day's "+" creates there), source/filter chips with colour dots that toggle several values in
  one param and double as the legend (calendar/page.tsx `?src=a,b`), a "Neu am …" chooser sheet (`?new=entry`: one
  `<LinkRows>` row per module, each link carrying the day), projects/quick-add.tsx (type + Enter creates and keeps the
  field, `router.refresh()`; a client server action returning `{ error }`), projects/board.tsx (kanban with phone column
  chips + snap), list grouped into sections by status or due bucket (`?group=`, Überfällig · Heute · Nächste 7 Tage ·
  Später · Ohne Datum), "Meine · Alle" with Meine as the default and `?assignee=all`, settings/column-rows.tsx (inline
  rows with ↑↓ and a colour popover, posted per scope by index, one SaveBar), the description of a record autosaving
  in place (`<AutosaveForm action={patch…}>` with hidden `id` + `field` and a `RichTextEditor name="value"`), the task
  panel's property rows (label · control in one autosave form; `ProjectField` = a RecordPicker that counts as input),
  `patchProject` (custom fields via `customInlineItems` too), `?edit=links` with ✕ that asks (`projects.confirmUnlink`).
- From Vermietung + Kurse: courses/attendance-list.tsx (tap a name = present, each tap saves through a client server
  action, optimistic with revert + toast, "Alle da", counter), courses/session-sheet.tsx (one sheet for a small child
  record used from two pages, `from` says where to go back; its ⋯ items + hidden forms exported separately so a page
  header can reuse them), ‹ › to the neighbouring records in a toolbar row, a record page's primary that changes with
  the state (Bestätigen as a header form button, Kündigung eintragen as a link, Zurücknehmen with confirm; Anwesenheit
  for today's date, else Termine anlegen, else Person hinzufügen), `rentalWith()` in rentals/actions.ts (the stored
  record in form format + the changed fields → the module's `read…()` checks the whole record; used by patchRental and
  saveTermAction), rentals/views.tsx (a list and its calendar as sibling routes under one sidebar entry:
  `/rentals/list` + `/rentals/list/calendar`, old route redirects), rentals/badges.tsx (rental state + object Frei /
  Vergeben / Verloren → colour), `?object=` + `?contact=` filter chips on Vergaben, `searchObjects` (rental objects
  picker), an optional "first child" card on a create page (`<details>` open when the calendar sent a day).
- From Settings · Start · Dateien · Wiki · Automationen · Admin: components/action-switch.tsx (`<ActionSwitch action
  confirmOn confirmOff>`: a switch that saves through a bound server action on flip, asks first when needed, flips back
  with a toast), `useLeaveGuard(dirty)` from save-bar.tsx (unsaved-changes guard for client editors without a form),
  `<SectionNav groups>` (labelled groups beside a settings-like area, desktop only) + src/settings/sections.ts
  (`settingsFor`, `areaSettings`), a phone index page made of `<LinkRows>` that opens on desktop to the first section
  (settings/desktop-opens.tsx), shifts/now-card.tsx (`<NowCard returnTo>`: clock in/out anywhere), src/lib/quick-actions.ts,
  `<FileUpload big>` (pick/drop target for an upload sheet) + `<FileDrop>` (drop onto a list), wiki/tree-sheet.tsx (a
  side tree as a sheet on phones), automations/run-badge.tsx, `<PageHeader titleHidden>` (pages whose editor shows the
  title), a run/history detail page as a vertical step list (automations/[id]/runs/[run]), "counts that open the filtered
  list" rows on Start, day-grouped inbox rows with an unread dot.
- Confirm = `data-confirm="<key>"` (+ `<key>Hint`) on any button/link. `<PageHeader crumbs>` with hrefs (phone back
  chevron). Header settings/actions/menu go into the phone ⋯ automatically; non-action controls (month navigation,
  filters) belong in the page toolbar.

## Also new (use them)
- `src/components/inline-field.tsx` (edit one value in place) — add `patch<Entity>(form)` actions that validate the
  one field with the module's fields.ts and update only that column; keep the full form for creating.
- Overlays (`<UrlSheet>`/`<ContentSheet>`) are centred dialogs from md automatically; `compact` for short ones.
- `link` utility class for inline links; `<ImageForm labelHidden>` (tap the picture to upload).
- Never hard-code control heights; button/input/select sizes come from the tokens.
- Anything new you find that you shouldn't fix in your area: add it to docs/plans/ux-backlog.md (§Z for questions).

## Process
1. Research per feature (every list, record, editor, run history, settings screen) how the best tools in that space
   do it — e.g. automations: Zapier, Make.com, n8n (builder canvas, step inspector, run history, run detail, overview);
   look at their overviews, empty states, detail views and phone apps, then decide. Research briefly how the best tools in the space do it (WebSearch/WebFetch ok) and take the simplest pattern.
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
   (AGENTS.md migration rules); new dependencies are fine when they clearly make the UX/UI better (well-known, maintained, small); say why in the commit.

## Rules
No hardcoded UI text (de.json + en.json). Comments describe what code does (no changelog comments). No AI attribution.
Don't run the dev server or `next build`. Before each commit: `npx tsc --noEmit -p .`, `npm run lint`, `npm test` pass.
Commit in between (spec, then per page group, then docs); `git commit` only, never push, only `git add` your own files.
At the end mark done items in your map file (`uxNotesDone`, redesign built) and reply with: commits, per page what
changed, what you decided not to do and why, reusable pieces for the next areas.
