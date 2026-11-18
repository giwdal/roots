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
