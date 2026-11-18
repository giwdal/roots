# UX overhaul (App + admin; public pages later)

Source: the screen inventory in `docs/ux-map/*.json` (fields, actions, overlays, links and `uxNotes` per page) and the
binding guides `docs/design/app.md`, `docs/design/patterns.md` (information structure, controls, menus) and
`docs/design/mobile.md`. This file is the work order: the rules every area is brought to, then the order of
the areas. Rules that are new or sharper than before also go into `docs/design/app.md`.

## 1. Think from the person first

As long as every feature keeps working, layouts, flows and page structure may be redesigned freely. Borrow proven
patterns from good dashboards (Linear, Stripe Dashboard, Shopify admin, Vercel, Luma/Eventbrite organizer views):
compact status header, KPI tiles, activity/timeline, the edit form tucked away, keyboard-first lists.

**Simple first.** Before redesigning a tool, look up how the best products in that space do it today (web search is
fine: e.g. Luma/Eventbrite for events and check-in, Shopify for shop/orders, Stripe/lexoffice/sevDesk for invoices,
Planday/Deputy for shifts, Personio for HR, Linear for projects, Mailchimp/Brevo for campaigns, Notion for wiki) and
take the simplest working pattern. Goal: an easy overview, simple for people who are not power users, never a screen
with dozens of decisions at once. Per screen: one main thing to look at, one main action, a few secondary actions,
the rest in ⋯ or one level deeper. Progressive disclosure over showing every option.


For every page ask: **who lands here, why, and what do they need in the first second?** Then build the page around
that, not around the table columns or the edit form.

- **A record page opens on its state, not its form.** An event shows date, status, sold / capacity, revenue, check-ins,
  what's open; a member shows membership status, open dues, last payment; an order shows paid / fulfilment and the next
  step; a project shows progress and what's due. These facts sit at the top (header `badge` + `meta`, then a row of
  `<StatCard>`-style tiles or a `<DetailList>`), followed by what the person *does* there most often (the next step as
  a button), then the related lists. **Editing the record's own fields is secondary**: a "Bearbeiten" action that
  opens a `<UrlSheet params={["edit"]}>` with the form, or a form card further down. Never a page that is mostly
  inputs to rename the thing.
- **Lists show what decides the next click.** Per table: the title column (name + one muted detail), the one status
  that matters, the one date that matters, the one number that matters (money right-aligned). Everything else goes on
  the record. 3–5 columns on desktop; on phones the card shows title, status and one line.
- **Next step, not every step.** If a record has an obvious next action (Rechnung ausstellen, Bestellung versenden,
  Beitrag kassieren, Schicht besetzen), it is the primary button of the record page. Rare actions go into ⋯.
- **Few modules or many:** an org may have 3 modules or 15. Nothing may assume another module is on: links, cards,
  ⌘K sources, start page tiles and empty states check `ctx.modules`. The start page shows what *this* org uses.

## 2. Overlays, pages, tabs

As in `docs/design/app.md` (unchanged, now enforced everywhere):

| Need | Use |
|---|---|
| Real content (related lists, files, activity) | own page `/<area>/<id>` |
| Edit a record's own fields, quick create, import, connect | `<UrlSheet>` from the bottom, `?edit=<id>` / `?new=<thing>` / `?connect=<key>` |
| Sub-views of a record (Event › Tickets, Lineup) | path segments, linked from a `<Segments>` row under the header — never a hand-built tab bar |
| Views/filters of a list | `<Segments>` (≤ 5) / `<FilterMenu>` in the list toolbar |
| Pick a value next to a field | popover |
| Yes/no | `data-confirm` → `<ConfirmHost>` |

No side drawers, no centred dialogs, no "Gefahrenzone" boxes. **URL params are only `?edit=`, `?new=`, `?connect=`
(plus the existing `?task=`), trash is always `?trash=1`.** Old params redirect.

## 3. Confirmations (one pattern)

`data-confirm="<message key>"` on the button (submit buttons, client buttons and links all work; `<MenuSubmit
destructive>` sets it). The question names the consequence (`…Hint` line for details): "Rechnung ausstellen? Danach
bekommt sie eine Nummer und lässt sich nicht mehr ändern." Ask before:

- deleting / trashing anything (rows inside a record too: ticket types, codes, slots, positions, rates, fields)
- anything with money: issue, cancel, refund, book, close a month, mark paid/collected
- anything that mails or notifies people: send now, resend, remind, cancel an event with subscribers
- anything that invalidates something outside: new guest-list link, new member card, revoke key/invite, disconnect an
  integration, rotate a secret, remove a person from the team
- bulk changes (`{count}`)

Not before: saving a form, adding things, toggles that are undone with one click.

## 4. Saving (one pattern)

- **One form per screen, one `<SaveBar>`**. A page or sheet with several separate "Speichern" buttons is merged into
  one form. Sections stay `<FormCard>`s inside the one form.
- **Inline lists of rows** (positions, columns, checklists, guests, variants) save with the record's SaveBar too
  (hidden JSON input, like `fields-editor.tsx`), or autosave per row — never a button per row.
- **Small state changes autosave**: status, toggles, checklist ticks, assignment — no button, a toast only on error.
- **Create** = `<SaveBar label="… anlegen" always />` everywhere, sheets included (no plain SubmitButton forms for creating).
- **Never create on GET**: `/<area>/new` shows the form; the record exists after "anlegen".
- Action buttons that also save (Testmail, Planen) submit the same form with `formAction`, so there is still one form.

## 5. Shared components instead of hand-built ones

- Views/filters: `<Segments>` (links) or `<FilterMenu>`; segmented choice in forms: `<Choice>` / `<SegmentGroup>`.
- One value from ≤ 15 options: `<Choice>`, not a NativeSelect.
- Records from big tables (contacts, events, projects, staff, objects, invoices, artists): a server-search picker
  (`<ContactPicker>`, or `<RecordPicker search={action}>` built the same way on the Base UI Combobox), never a select
  with hundreds of rows.
- Money: `<TypedInput kind="money">`; dates/times: `<DateInput>` (never native date/time inputs).
- Facts: `<DetailList>`; empty lists: `<EmptyState action>`; page width: `<Page>`; header: `<PageHeader>` on every page.
- Lists: `<ExportMenu>` where the data is something people take to Excel.

## 6. Navigation

- Every area page is in `src/modules/nav.ts`; every record type has a ⌘K source (`src/search/actions.ts`).
- Every soft-deleted thing has a trash view with restore.
- Links from a record go to the related *record* (or a list filtered to it), never to an unfiltered list.
- One word per thing (glossary below); sidebar label = page title = crumb.

Glossary: Veranstaltung → **Event**; Einlass (area), einchecken (action), Check-in (the fact); Mitglieder (area),
Mitgliedschaft (one period); Rechnungen (area: Angebote + Rechnungen); Vorlagen = letters (Dateien), E-Mail-Vorlagen
(E-Mail).

## 6b. How modules work together

The modules are one tool, not 20 apps. Four hubs hold them together; every record shows its connections to records of
*other active modules* in one place ("Verknüpft" card / tab on the record page, hidden when empty or the module is off),
and every connection is visible from **both** sides.

| Hub | Record | Should show / offer (only modules that are on) |
|---|---|---|
| **Person** | Kontakt | membership + open dues, tickets & guest-list entries, shop orders, invoices & payments, course places, rentals, form submissions, mails sent, employee/shift profile, files, notes/activity. Actions: Mail, Rechnung, Ticket/Gast hinzufügen, Kurs anmelden |
| **Event** | Event | sales (tickets, shop at the door), check-ins, guest lists, lineup, shifts for that day, linked project/tasks, campaigns to buyers, forms, cash book. Actions: Schichten planen, Kampagne an Käufer, Gästeliste |
| **Money** | Bestellung → Zahlung → Rechnung → Kassenbuch | each step links the next and the previous (order ↔ payment ↔ invoice ↔ cash entry), and back to the source (event, product, member, rental, course) and the person |
| **Time** | Kalender | everything dated; every entry opens its record; creating from a day picks the module |

Rules:
- Start cross-module work where the person already is (from an event: "Schichten planen", not "go to Schichten, pick the event").
- A link goes to the record, or to the other module's list *filtered* to this record (`?event=`, `?contact=`), never an unfiltered list. Add the filter param to the target list when it's missing.
- Never show a dead link or empty card for a module that is off or not permitted (`ctx.modules`, `ctx.can`).
- Same entity, one place to edit it: buyer mail texts, stock, door settings each live in exactly one module; the others link there.
- Gaps found in the map (to close in the area passes): Kontakte has no shop orders, courses, payments, shifts/HR; Zahlungen ↔ Rechnungen not linked; Mitglieder → Beiträge → Zahlungen not linked; Events ↔ Kampagnen/Formulare/Projekte/Schichten one-way or missing; HR ↔ Kontakte/Schichten-Team link not settable; Kurse/Vermietung → Rechnungen missing.

## 7. Phones (native-app feel)

The full concept is `docs/design/mobile.md` (binding): shell, overlays as action sheets on phones, list/record/form
screens, touch rules, checks. Short version:


- Check every changed screen at 375 px: header facts first, primary action as the round button, tables as cards, sheets
  full width with the SaveBar at the bottom, nothing only on hover, touch targets ≥ 44 px in bars.
- Record pages: facts and the next step before anything long; the aside comes before the long edit form on phones
  (order with `order-*` or by moving editing into the edit sheet).
- No horizontal page scroll; wide things scroll in their own box.

## 8. Order of work (one commit per area at least)

1. Foundation: ConfirmHost for client buttons, `<RecordPicker>`, `<Stats>`, look + area colours (done).
1b. Phone shell (`docs/design/mobile.md` §6.1): top bar back + phone ⋯, search sheet, menus/popovers as action sheets.
2. Events (overview, tickets, lineup, guest lists, Einlass settings) · Einlass
3. Shop (products, orders, Lager, settings)
4. Finanzen (Rechnungen, Zahlungen, Kasse, Berichte)
5. Kontakte · Mitglieder (incl. Beiträge, SEPA)
6. Kommunikation (E-Mail, Formulare) · Gästelisten
7. Schichten · HR
8. Projekte · Kalender
9. Vermietung · Kurse
10. Settings · Dateien · Wiki · Automationen · Benachrichtigungen · Start · Admin
11. Shell: ⌘K sources, phone inbox, shortcuts help, org creation for single-org people
12. Connections pass: walk §6b across all modules and close the remaining gaps (both directions)

Public pages (`public.json`) follow later.
