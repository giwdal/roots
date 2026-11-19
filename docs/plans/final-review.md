# Final UX review (after the overhaul + sweep)

Nine flows walked end to end as the person who does them, phone (390 px) and desktop (1280 px), dark mode, in the UX
Test org (forms submitted there; nothing mailed or charged). Screens checked step by step; console / page errors logged.

## Verdict

**Good, close to state of the art for its class.** Every flow can be finished on a phone and on desktop without a dead
end, record pages open on their state (stats, badge, next step as the one primary), confirmations name the
consequence, toasts say what happened, the phone shell (tab bar, Menü tiles + drill-down, search sheet, action sheets)
feels native, and the module hubs (contact ↔ membership ↔ order ↔ invoice ↔ payment) link both ways. No page errors in
any flow. What still costs trust is a handful of **logic edges around money and availability** (below, 1–4) rather
than layout: an event that shows "ausverkauft" at the door before a single ticket is sold, a new member who is overdue
on day one, an invoice that stays "Offen" after its order was paid (fixed), and an issued invoice that can't be sent.

## Fixed in this review

| What | Where |
|---|---|
| Contact search found nothing for "Vorname Nachname" (one `ilike` per column with the whole phrase). Now word by word (`matchWords`, `src/lib/search-words.ts`) in the contact picker, Kontakte, Mitglieder, Beiträge, their exports and ⌘K. | search everywhere |
| A team order's invoice ("Rechnung erstellen", auto invoices off) stayed "Offen" after the order was paid: `ensureInvoice()` returned at the auto-invoice check before syncing an existing invoice. | `src/shop/server.ts` |
| Back after any Server Action landed on the same page (Server Action `redirect` pushes): `back()` now replaces. After creating, Back goes to the list, not the stale form; after deleting, not to the gone record. | `src/lib/url.ts` |
| Every confirmation's button was red, also for "30,00 € bezahlt", "Rechnung ausstellen", "Monat freigeben", "Jetzt senden". Red only for destructive questions now. | `<ConfirmHost>` |
| Picture uploads (event image, org logo, profile, product) showed their camera only on hover: a visible "Hochladen / Bild ändern" link next to the picture. | `<ImageForm>` |
| Einlass opened via "Einlass" on an event showed the first chips (past events); the chosen event's chip was off-screen. `<ChipRow>` scrolls it into view. | `/scan` |
| Event draft on phones: the "Vor dem Veröffentlichen" checklist (the next step) came after all properties; now right after the stats (desktop unchanged). | event page |
| Membership without dues was a dead end ("Keine Beiträge."): explains where dues come from and links "Beiträge erzeugen". | membership page |
| Contact facts on phones spent two of five slots on Vorname / Nachname (already the title); they come after phone, address, company, birthday now. | contact page |
| ⌘K rows cut invoice numbers ("RE-2026-00…") at 390 px. | search sheet |
| "Veranstaltung" left in App texts (notifications, guest lists, door, reports, projects) → Event (glossary). | de.json |

## Open findings (ranked)

1. **Ticket availability bug (already §Z, still the most visible defect).** Every new event's ticket type without a
   quota shows "noch 0 frei", and Einlass shows "Noch verkaufbar: ausverkauft" in red. A door person would believe the
   event is sold out. Fix = the one-line migration in §Z (`case when quota is null`).
2. **New members are overdue on day one.** Joined 19.11.2026, yearly fee → "Regulär 2026, fällig 15.01.2026",
   immediately "Überfällig", full year charged. Where: dues generation (`src/members/dues.ts` / `generateDues`). Why:
   wrong reminders, wrong "Überfällig" stats, angry members. Proposed: due date = max(period due date, start of
   membership); pro-rata for joiners as an org setting (→ §Z).
3. **Issued invoices can't be sent.** The invoice page offers Vorschau / PDF, Als bezahlt markieren, Duplizieren,
   Stornieren – no "Per E-Mail senden" (letters and shop orders can mail PDFs already). After issuing, sending is the
   natural next step. Proposed: "Senden" (primary while `sent` and never mailed) via `sendOrgEmail()` with the PDF
   attachment, `email_log` kind `invoice.sent`, a "gesendet am" fact; "Als bezahlt markieren" moves next to it.
4. **Team order "Schon übergeben / erledigt" is ticked by default even with "Noch offen".** Result: an unpaid order
   that is "Erledigt", and the progress line shows Bestellt ✓ · Bezahlt ○ · Abholbereit ✓ · Erledigt ✓. Where:
   `shop/orders/new/new-order-form.tsx`. Proposed: untick (and hint) when "Noch offen" is chosen.
5. **Phone: the main action three times on issued invoices** (full-width button in the page, round button, ⋯ sheet).
   The in-page button is the clearest (it has a label; the round button only a wallet icon). Proposed: drop the round
   button when the page renders its own labelled button, or drop the in-page one (→ §Z, relates to S9).
6. **Phone back chevron says "Zurück zu Kontakte" but goes to the previous screen** (App history: member → contact →
   back = member). Behaviour is right (native stack); the `aria-label` is wrong whenever the previous screen isn't the
   parent. Proposed: "Zurück" when the history entry is used, the parent's name only for the fallback.
7. **Phone create pages show ☰ and ‹ next to each other** (bar fallback because the SaveBar hides the tab bar, plus the
   back chevron). Two left icons with different meanings. Proposed: on pages with a back target, the ⋯ sheet gets a
   "Menü" row instead of the ☰ in the top bar.
8. **Contact hub lacks the facts at a glance.** No stats/badges for open dues, last payment, next ticket; the
   Mitgliedschaft card shows type + since, not "30,00 € offen". Payments are titled just "Shop" (no order number) in
   the hub and in ⌘K. Proposed: one meta line under the name (open amount, member since) and "Shop #1006" as title.
9. **Membership page repeats itself:** Mitglied seit and Beitrag are both a stat tile and a property. Proposed: tiles
   Offen · Bezahlt bis · Nächster Beitrag; properties keep the editable values.
10. **0 € team order with "Rechnung erstellen" ticked** silently gets no invoice (free orders never do). Proposed:
    disable the box while the total is 0 with the reason.
11. **Publishing from Event › Tickets jumps to Übersicht** (the form posts to the overview); stay on the tab.
12. **Ticket type cards on phones** show price, "0" and "noch 0 frei" stacked without labels; "0 verkauft".
13. **Task sheet title is the project's name**, the task title sits below as the first field. Reads as if the project
    was opened. Proposed: title = task, project as the meta line (link).
14. **Neues Event:** Kapazität sits in the "Beschreibung" card; belongs to "Wo" or a "Tickets" card.
15. **Hours with two decimals** (28,52 h, 0,02 h) next to 7,5 h; `hoursText` could show h:mm or one decimal.
16. Dev console: Base UI warns "changing the default value of an uncontrolled FieldControl" on the invoice draft after
    picking a contact (harmless, but noise in the logs).

Data note: UX Test now holds review records (events "Review Konzert D/P", "Review Back-Test", contact "Rita ReviewP"
with membership, dues, shop orders #1004–#1007, invoices RE-2026-0004…0007, project "Review Projekt D"). RE-2026-0004
and 0005 were created before the invoice fix and still say "Offen".
