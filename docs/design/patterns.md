# roots — information structure & patterns

Binding with `app.md` and `mobile.md`. Answers, for every screen: **where does what go, how is each kind of
information shown, which control for which input, and when is a menu needed.** References: Linear / Vercel / Stripe
settings, iOS Settings, the dashboards in `docs/design/references/`.

## 1. Four kinds of screens

| Screen | Structure | Example |
|---|---|---|
| **Overview** (area home, list) | toolbar (search · segments · filters) → list → empty state | Events, Kontakte |
| **Record** | header (title, badge, meta, ⋯, next step) → stats → sections (facts, related lists, activity) | an event, a member |
| **Settings** | grouped rows: one row per setting, label + hint left, control right | Profil, Shop-Einstellungen |
| **Flow** (create, import, checkout at the door) | one step at a time, one column, the action at the bottom | Neues Event, CSV-Import |

Every page is one of these. A page that is two of them (a record that is also a big settings form) is split: the
settings go into the record's "Bearbeiten" sheet or an Einstellungen sub-page.

## 2. Settings pages (grouped rows)

Like iOS Settings / Linear: sections with a small heading, each a rounded group (`rounded-xl border divide-y`) of rows.

```
Profil
┌──────────────────────────────────────────────────────────┐
│ (avatar)  Daniel Ladwig                    [Ändern]      │  ← identity row: picture + name, tap picture to change
│           ladwig@…                                       │
├──────────────────────────────────────────────────────────┤
│ Sprache                               [ Deutsch ▾ ]      │  ← label left, control right
├──────────────────────────────────────────────────────────┤
│ Darstellung                  [☀ Hell|☾ Dunkel|▭ System]  │
└──────────────────────────────────────────────────────────┘
Benachrichtigungen
┌──────────────────────────────────────────────────────────┐
│ Neue Bestellung            E-Mail [✓]   In-App [✓]       │
└──────────────────────────────────────────────────────────┘
```

- **Choices, toggles, switches save on change** (no button, toast only on error) — language, theme, notification
  channels, module switches.
- **Text values** (name, address, IBAN) are edited in place and saved with the page's one `<SaveBar>`, or — when a
  row is rarely changed — the row shows the value with "Ändern" → a compact sheet with the field + Speichern.
- **Pictures**: the picture itself is the button (tap → file picker → upload at once, with a spinner on the picture);
  "Entfernen" is in a small ⋯ or under the picture. Never a native "Choose File · No file chosen" input plus a
  separate "Hochladen" button.
- Hints sit under the label in `text-xs text-muted-foreground`, one line. Phones: the control moves under the label
  when it doesn't fit (`flex-wrap`), rows stay ≥ 48 px.
- Sub-navigation of a settings area: a left section nav on desktop, a list of rows (› chevron) on phones that opens
  the sub-page — never both a sidebar entry and a section nav for the same thing.

## 3. Showing information (read)

| Information | Show as |
|---|---|
| The state of a record (status, paid, published) | `badge` in the header; colour only for state: `<Badge variant="success">` done/paid/live, `warning` waiting/open, `destructive` problem/overdue, `info` scheduled/in progress, `secondary`/`outline` draft/neutral. Never `default` (black) for a status |
| A few key numbers | `<Stats>` tiles (2–4) |
| Facts (dates, people, amounts, references) | `<DetailList>` (label above value on phones, two columns from sm) |
| Several similar items (tickets, positions, payments) | `<DataTable>` (cards on phones) or a row list `icon · label · muted detail · ›` |
| A short list inside a section (tools, schedule, links) | rows `icon + label + muted detail`, a quiet "+ Hinzufügen" link at the end |
| History | `<ActivityFeed>` / timeline, newest first, grouped by day |
| Dates over time | `<CalendarView>` / `<Timeline>` |
| Long text | rendered rich text, collapsed after ~8 lines with "Mehr" |
| Contact data | links: `mailto:`, `tel:`, URLs in a new tab |
| Empty | `<EmptyState>` with the one action that fills it |
| Money | `t.money()`, right-aligned, `tabular-nums`; negative in red only when it's a problem |

## 4. Entering information (write)

| Input | Control |
|---|---|
| Short text | `<Input>`; known kinds via `<TypedInput kind>` (email, phone, url, iban, bic, postcode, money, number) |
| Long text | `<Textarea>` (plain) or `<RichTextEditor>` (formatted, mails, descriptions) |
| Yes/no | `Switch` when it takes effect at once (settings); checkbox inside a form that is saved |
| One of ≤ 5 | `<Choice>` → segments |
| One of 6–15 | `<Choice>` → native select |
| One of many (records) | `<RecordPicker>` / `<ContactPicker>` (server search) |
| Several of a list | `<MultiSelect>` / `<TagSelect>` (chips) |
| Date / time / range | `<DateInput>`; ranges = two DateInputs side by side |
| Recurrence | sentence-style: "Jede [Woche] am [Mo Mi] von [18:00] bis [20:00]" |
| Picture / file | drop zone or the picture as the button (`<ImageForm>`, `<FileUpload>`) — never a bare file input |
| Colour / icon / emoji | swatch / picker popover |
| Order of items | drag handle + "Nach oben/unten" in ⋯ (touch and keyboard) |

Labels above fields, required fields are the default (mark *optional* ones with "(optional)", not required ones
with \*), errors under the field in red, the form keeps what was typed on any error.

## 5. Actions — when a menu, when not

- **Visible buttons**: the one main action (primary) + at most 2 frequent secondary ones (outline).
- **⋯ menu** for everything else: rare actions (duplicate, export, import, print), destructive ones (last, red,
  confirm), and on phones all header actions.
- **No menu** when a screen has ≤ 2 actions in total — show them.
- **Row actions**: tap the row → the record. Extra row actions (≤ 2) as icon buttons at the end on desktop, in the
  row's ⋯ on phones; never hover-only.
- **Inline list editing** (positions, columns): the row is the editor, the delete ✕ is always visible, "+ Hinzufügen"
  at the end.
- **Bulk**: tick boxes + bulk bar on desktop only (`app.md`).

## 6. Labels & text

- Sidebar label = page title = crumb = the word in buttons (`ux-overhaul.md` glossary). One word per thing.
- Buttons say what happens: "Rechnung ausstellen", not "OK" / "Weiter" / "Absenden".
- Section headings are nouns ("Adresse", "Zahlung"), hints are one short sentence, no intro paragraphs on overviews.
- Numbers with units ("3 Monate", "12 / 200 verkauft"), dates relative when near ("heute 18:00", "morgen").

## 7. Navigation: sub-pages, sidebar, sheets or one page

Decide for every piece of content where it lives, with this test:

| The content is … | It lives … |
|---|---|
| a different **job** people come to do (sell at the door, approve hours, pay out) or a different **list of things** they work through daily | its own **sub-page in the sidebar** (max 3 per area) |
| another **view of the same things** (calendar vs list, board vs list, mine vs all, org chart vs list, log of the same mails) | a `<Segments>` switch **on the page**, not in the sidebar |
| **setup** you do once and rarely touch (types, positions, templates, number ranges, door settings, team setup) | the area's **Einstellungen**, reached by the gear in the header — never a sidebar entry |
| one **record** with real content | its own page `/<area>/<id>` (not in the sidebar) |
| a record's **own fields**, a quick create, a small record | a `<UrlSheet>` |
| a **sub-view of a record** (Event › Tickets) | a path sub-page linked by `<Segments>` under the record header |
| **personal** things (my shifts, my tasks, my hours) | the person's **Start** page ("Für dich") + a "Meine" segment on the list; for people who only have the personal permission the area opens on it |
| a **report** about an area | `<Stats>` on that area's overview; the global Auswertungen only for cross-area numbers |

Rules: an area with one page has no children in the sidebar; "Übersicht" is never a label (the first child is named
after what it lists: "Events", "Bestellungen"); "Einstellungen" is never a sidebar child (gear, and all of them listed
in Settings › Bereiche); the sidebar shows only what this person may open.

### Target sidebar (to build in the area passes)

| Area | Sidebar children | Moves out of the sidebar |
|---|---|---|
| Kalender | – | |
| Kontakte ✓ | – | |
| Mitglieder ✓ | Mitglieder · Beiträge | Mitgliedsarten (a group in Einstellungen), Einstellungen → gear |
| Events | Events · Gästelisten · Einlass | |
| Schichten ✓ | Plan · Stunden | Meine Schichten → segment "Meine" on Plan + Start; Team & Positionen, Einstellungen → gear |
| Personal ✓ | Personen · Abwesenheiten · Lohn | Organigramm → segment on Personen |
| Kurse | – | |
| Finanzen ✓ | Rechnungen · Zahlungen · Kassenbuch | Einstellungen → gear |
| Kommunikation ✓ | E-Mails · Formulare | Automationen, Versand → segments on E-Mails (Kampagnen · Automationen · Versand); E-Mail-Vorlagen → E-Mail-Einstellungen (gear) |
| Automationen | – | |
| Projekte | Projekte · Aufgaben | "Alle/Meine Aufgaben" → segments on Aufgaben; Einstellungen → gear |
| Vermietung | Objekte · Vergaben | Belegung → segment (Liste · Kalender) on Vergaben |
| Shop ✓ | Bestellungen · Produkte | Lager → segment "Bestand" on Produkte (movements in the product); Einstellungen → gear |
| Wissen, Auswertungen | – | |
| Website | Seiten | Marke, Domain → gear (Website-Einstellungen) |

Old URLs keep working (redirect to the new place). An area's Einstellungen stays in `src/modules/nav.ts` with
`gear: true`: not in the sidebar or the Menü sheet, but in ⌘K and Settings › Bereiche (Shop is the first area using it).

## 8. Record pages (decided)

Research: Linear issue view, Attio / HubSpot records, Stripe customer & invoice pages, Shopify order page — all use the
same shape: identity on top, the work in a main column, the properties in a rail you edit in place.

**Layout**
```
Desktop (xl)                                         Tablet / phone
┌ crumbs ─────────────────────────────── ⋯  Primary ┐  ┌ ‹  Name               ⋯ ┐
│ Name  [Badge] [Badge]                              │  │ Name  [Badge]           │
│ meta · meta                                        │  │ meta                    │
│ [Stat] [Stat] [Stat] [Stat]                        │  │ [Stat] [Stat]           │
├───────────────────────────────┬───────────────────┤  │ [Stat] [Stat]           │
│ Main: what happens            │ Eigenschaften     │  │ Eigenschaften (top 4,   │
│  – next-step box (if any)     │  label  value ✎   │  │  "Alle anzeigen")       │
│  – related lists (Sections)   │  label  value ✎   │  │ Main sections           │
│  – activity / timeline        │ Verknüpft         │  │ Verknüpft               │
│                               │ Dateien           │  │ Aktivität               │
└───────────────────────────────┴───────────────────┘  └ (round primary button) ─┘
```
- **Identity header** (`<PageHeader crumbs title badge meta>`): the name is shown in the page together with its badges
  — never a lone badge pill above the content. The crumbs stay in the top bar.
- **Main column** = what the person works with (lists, activity, the next-step box). **Right rail** (`xl:` ~340 px,
  `<Section>`s) = properties, connections ("Verknüpft"), files. From `lg` down everything is one column: identity →
  stats → properties (first 4, rest behind "Alle anzeigen") → main sections → connections.
- Simple records (a few fields, no related content) are one column, or a dialog (`?edit=`) if they don't need a page.

**Editing (the Linear way)** — sources: Linear changelog "Inline editing" (https://linear.app/changelog/2022-06-09-inline-editing:
"just click on the issue description or title to start editing. Your changes are saved automatically"), Linear docs
"Edit issues" (https://linear.app/docs/editing-issues) and "Issue properties" (https://linear.app/docs/issue-property),
2026 UI refresh (properties integrated closely with the main content).
- Single values (name, email, phone, dates, status, a choice) are edited **in place** with `<InlineField action id field
  value kind>` (`src/components/inline-field.tsx`): the value looks like plain text (no border, soft hover); a click or
  Tab edits it, Enter or leaving saves automatically, Esc restores; no save/cancel buttons; a small spinner while it
  saves; errors → toast and the old value. Choices (status, type, person from a short list) open a small menu with a
  filter and a check on the current value; on phones that menu is a bottom sheet. Empty values show "Leer" in muted text. The area provides a `patch<Entity>` server action that validates the one field with the
  module's `fields.ts` and updates only that column.
- Compound values (address, bank details, a schedule) open a compact dialog (`?edit=<part>`) with those fields and a
  SaveBar. Long text (description) edits in place as a textarea / rich text block.
- No "Bearbeiten" button that opens the whole record form on record pages; the full form remains for **creating**.
- Status changes are the primary / ⋯ actions (Veröffentlichen, Stornieren …), not a select in a form.
