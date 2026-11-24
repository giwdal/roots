# UX sweep — second pass over every area

After every area had its redesign pass, the rules grew (system.md sizes and contrast, Linear-style inline editing,
one verb per action, dialogs on desktop, phone calendar, record layout §8, comments …). The sweep brings **every**
page up to the final rules and looks at each from the user's point of view once more. Public pages are out of scope.

Order (one agent at a time, commit per area): Events · Einlass · Gästelisten → Shop → Finanzen → Kontakte ·
Mitglieder → Kommunikation (E-Mail, Formulare) → Schichten · Personal → Projekte · Kalender → Vermietung · Kurse →
Settings · Dateien · Wiki · Automationen · Benachrichtigungen · Start · Admin → shell (sidebar, top bar, tab bar,
Menü, search, Sprout).

## Checklist per page (tick in the map file's `redesign.sweep`)

**Job & flow**
- [ ] What does the person come here for? Is that the first thing they see (phone and desktop)? One main action,
      ≤ 2 visible secondary, the rest in ⋯.
- [ ] The way in and out: reached from the sidebar/search/related records; back returns where they came from;
      every link lands on the record or a filtered list.
- [ ] Works when only this module is on; shows connections only to modules that are on and permitted.

**Record pages (patterns.md §8)**
- [ ] Identity header (name + badges together), Stats with short values, main column = work, right rail = properties.
- [ ] Single values edit in place (`<InlineField>` + `patch<Entity>`; custom fields via `customInlineItems`);
      compound values in a compact dialog; no "Bearbeiten" button that opens the whole form (a full-form fallback in
      ⋯ is fine where tags/multi-values need it).
- [ ] Next step as primary; status changes as actions; risky actions ask first with the consequence.

**Lists**
- [ ] 3–5 columns that decide the next click; title column = name + one muted line; status as coloured badge;
      money right-aligned. `<ListToolbar>` (search, filters, Segments). EmptyState with the action. Trash `?trash=1`
      with restore where things are soft-deleted. Export where people take data to Excel.

**Forms & controls**
- [ ] One form + one SaveBar per screen; create = `SaveBar always label="… anlegen"`; never create on GET.
- [ ] Controls from the system (sizes via tokens), `<Choice>` ≤ 15, RecordPicker for big tables, TypedInput for
      money/phone/email/IBAN, DateInput/TimeInput (24 h), pictures via tap.
- [ ] Labels above fields; optional fields marked, rarely used ones behind "Mehr Angaben"; no duplicate labels.

**Words**
- [ ] One verb per action (system.md): In den Papierkorb · Löschen · Entfernen · Stornieren · Abmelden.
- [ ] Sidebar label = page title = crumb; glossary (Event, Einlass/einchecken, Ein-/Ausstempeln for time,
      Mitglieder/Mitgliedschaft, Kampagnen); no intro paragraphs on overviews; buttons say what happens.

**Phone (mobile.md §5)**
- [ ] 375 px: nothing sideways, header facts first, primary as the round button, lists as tappable cards, no
      squeezed button rows (one action per row, rest in ⋯), sheets full width with SaveBar above the keyboard,
      no hover-only controls, calendars/boards in their phone patterns.

**Look (system.md)**
- [ ] Sections with soft dividers rather than boxes in boxes; status badge variants; `link` for inline links;
      icons 16 px; no hard-coded control heights; skeleton in loading.tsx matches the page.

**Speed (performance-review.md)**
- [ ] No sequential independent queries, no per-row queries; heavy client parts loaded lazily.

Write findings that need a decision into docs/plans/ux-backlog.md §Z; process ideas into
docs/plans/process-simplification.md.

## Visual check (required in the sweep)

Look at every page you touch, phone (390 px) and desktop (1280 px), dark mode, before and after:

```
cd /private/tmp/claude-501/-Users-daniel-Development-roots/abc88f8a-a989-410d-80a5-960b20a5148b/scratchpad
node --env-file=/Users/daniel/Development/roots/.env.local shoot.mjs ladwig.daniel@icloud.com shots /events /events/<id> …
```
writes `shots/phone_<path>.png` and `shots/desk_<path>.png` (open them with the Read tool) and prints `PAGEERROR` /
`CONSOLE` lines for runtime errors — fix every one. The script signs in with a one-time admin link and **always**
forces the org "UX Test" (`20c47c3b-be79-42fb-841d-703bceb6fe5e`). The local App runs on the **production
database**: never open, seed or change anything in another org (Coppi, Lengua Materna are real customers). Only
GET pages in the screenshots — no clicking through destructive actions. If a page needs data to be judged, add demo
rows **only** in the UX Test org (SQL that checks `org_id = '20c47c3b-…'`). Only one browser run at a time.
