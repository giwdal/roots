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
| The state of a record (status, paid, published) | `badge` in the header; colour only for state (green done, amber waiting, red problem, grey draft) |
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
