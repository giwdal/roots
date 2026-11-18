# Process simplification — ideas where UI alone can't help

Collected during the UX overhaul (Nov 2026) from the screen inventory (`docs/ux-map/*.json` uxNotes) and the area
passes' "decided not to do" lists. These change models, flows or automation, not just screens. To discuss and
prioritise; nothing here is built.

## People: one person, not four records
- Today a person can be a **contact**, a **team user** (login), a **shift staff** member and an **HR employee** — four
  rows linked by hand (`contacts.user_id`, `staff.user_id`, `employees.staff_id`), and some links aren't settable in the
  UI. Idea: the contact is the person; staff and employee are *roles/profiles on the contact* (one link each to the
  contact), the login is optional. Creating a shift team member or employee picks or creates the contact.
- Members, buyers, guests, course participants are already contacts (good); tickets/payments are matched by **email**
  in places (payments have no contact link) → store `contact_id` on orders/payments at checkout.

## Money
- **Invoices by email + dunning**: "Rechnung senden" (PDF attached, uses the org mail) and a reminder ladder
  (Erinnerung → 1. Mahnung → 2. Mahnung with fees, due dates from settings), shown as the invoice's next step.
- **Bank statement import** (CSV/CAMT.053) that matches transfers to open invoices, dues and shop orders by reference /
  amount and marks them paid in one review screen — replaces many single "Als bezahlt markieren" clicks.
- **Dues run on autopilot**: dues generated per period automatically from the membership type (no "Beiträge erzeugen"
  step), SEPA file prepared monthly, reminders sent by rule; the treasurer only reviews.
- **One payment flow for every module**: courses and rentals have no invoices/payments link yet; let every sellable
  thing go through `createOrder` + optional invoice, so Zahlungen and Rechnungen cover everything.
- **Cash book**: door cash and shop cash sales book themselves (partly done); fixed categories (a small table) instead
  of free text; month close suggests the counted amount from the entries.
- Negative opening balance for bank accounts (money input only allows positive amounts today).

## Events & door
- **Undo a check-in** for tickets (guests have it): needed at the door and asked for by the user.
- **Event templates / duplicate with tickets, lineup, shifts** for recurring events.
- **Door settings per event** vs per org: most orgs use the same door setup → org default + per-event override.
- Cancelled/past events selectable in Einlass for late check-ins/corrections.

## Members & forms
- Membership applications: optional auto-accept rules (e.g. type X with SEPA mandate → accept), so the board only
  handles exceptions.
- Member card renewal and "new card" invalidation as one action with a mail to the member.

## Communication & automation
- Two automation systems (E-Mail-Automationen and the Automationen module) overlap → one automation engine; email
  automations become a template ("when X, send mail Y") inside Automationen.
- Campaign templates: E-Mail-Vorlagen apply to event mails only; let campaigns start from a template.
- Retry failed mails (queue rule) and test sends for automations.
- Live recipient count while composing a campaign.

## Shop
- Stock model: "unlimited vs counted" lives in the stock number field; a clear per-variant switch "Bestand zählen"
  would remove the special cases (booking on unlimited items).
- Bulk actions/export for products; preview of buyer mails before resending.

## Shifts & HR
- Open shifts people can take themselves (with approval rule), swap requests, availability.
- Approval of hours per week instead of per month for orgs that pay weekly; payroll export formats (DATEV-ready CSV).

## Setup & navigation
- **Guided setup per module** (checklist on the area's empty state: create a membership type → import members → set
  SEPA creditor data), instead of empty pages with hints.
- **Area settings defaults**: many settings could have good defaults and never need a visit.
- Personal vs org vs area vs platform settings are mixed (Profil sits inside the org's Einstellungen) — see backlog F1.
- Calendar is read-only: creating from a day (choose the module) would make it the place to plan.
- One person in several orgs: org switch is silent when opening a notification of another org.

## Platform
- Live data in local dev: local runs on the production database; a separate staging/dev Supabase project would make
  testing safe (a staging setup was discussed: second free project + `staging` branch on Vercel).
