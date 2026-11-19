# Kontakte zusammenführen (#27) Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zwei Kontakte derselben Person werden zu einem: alles, was am zweiten hängt (Mitgliedschaften, Tickets, Notizen, Dateien, Rechnungen …), hängt danach am ersten; mögliche Duplikate (gleicher Vor- + Nachname) findet das Team in einer Liste und am Kontakt.

**Architecture:** Eine Datenbankfunktion `merge_contacts()` (security definer, eine Transaktion) hängt alle Verweise um, übernimmt die gewählten Felder und legt den zweiten Kontakt in den Papierkorb. App (eigene Seite `/contacts/<id>/merge`), Key-API, MCP und Sprout rufen dieselbe Server-Funktion `mergeContacts()`. Duplikate kommen aus einer RPC `contact_duplicates()` (invoker, RLS).

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (Migration + RPC), zod (API), `node --test`.

**Spec:** Issue [giwdal/roots#27](https://github.com/giwdal/roots/issues/27) („Zwei Kontakte zu einem mergen: Mitgliedschaften, Tickets, Notizen, Dateien umhängen“) und [giwdal/roots#31](https://github.com/giwdal/roots/issues/31), Abschnitt „Aufnahme und Mitgliedschaft“, Zeilen s03: „Gleiche Person erkennen: E-Mail, dann Vor- + Nachname … 🔨 Abgleich nach Namen; 🧭 unklare Treffer klärt die Boxoffice“ und „Kontakte zusammenführen … 🔨“. Hintergrund: `~/Downloads/coppi_missing_pieces.md` Abschnitt s03.

## Global Constraints

- Schema nur per neuer Datei `supabase/migrations/<yyyymmddhhmmss>_contact_merge.sql` + `npm run db:push`; danach `npm run db:types`, `npm run db:test` („all checks passed“), MCP `get_advisors` (security + performance). Kein MCP `apply_migration`.
- Keine neue Tabelle (kein Eintrag in `OBJECTS`/`NOT_OBJECTS` nötig).
- Kein UI-Text hart im Code: alles in `src/i18n/messages/de.json` und `en.json`; DB-Fehlercodes als `errors.<code>` in beiden Dateien.
- UI nach `docs/design/app.md`: eigene Seite (kein Sheet), `<PageHeader crumbs>`, `<DetailList>`, `<SubmitButton data-confirm>`, Telefon zuerst (375 px), Hell + Dunkel.
- Jede App-Funktion auch in der Key-API (`src/api/v1/contacts.ts`), mit klarer `summary` + `description`; Merge ist in MCP eine „danger“-Operation.
- Tests und Klicktests nur in den Domes-Testorgs, **nie in Coppi** (echte Kundin).
- `npm run lint` und `npm run build` vor dem Commit; `build` nicht, während `next dev` läuft (danach Dev neu starten).
- Commits ohne AI-Attribution.

## Review Focus

- **Beide Kontakte haben eine laufende Mitgliedschaft im selben Zeitraum** → der Überlappungs-Trigger wirft `membership_overlap`; es wird *nichts* geändert und die Seite zeigt den Hinweis „erst eine Mitgliedschaft beenden“. Test: Task 1, Schritt 1 (Assertion „overlap rolls back“).
- **Ausgestellte Rechnung am zweiten Kontakt** → `documents_guard` sperrt `contact_id`; beim Merge darf nur dieser Link wandern, Empfängername/-adresse der Rechnung bleiben unverändert. Test: Task 1 (Assertion „issued invoice moves, recipient frozen“).
- **E-Mail des zweiten Kontakts übernehmen** → der eindeutige E-Mail-Index darf nicht greifen (zweiter Kontakt wird *vor* dem Update des ersten in den Papierkorb gelegt). Gleiches für `member_code` (unique) und `user_id`. Test: Task 1 („take email + member_code“).
- **Automationen** → das Umhängen vieler Zeilen erzeugt `audit_log`-Einträge; Record-Trigger-Workflows (`record:memberships:update` …) dürfen dadurch nicht starten (sonst Mails an Mitglieder). Test: Task 1 („merge starts no workflow runs“).
- **Fremde Org / fremder Kontakt per API-Key** → Kontakt-IDs aus einer anderen Org ergeben „nicht gefunden“, nichts wird geändert. Test: Task 1 (Assertion mit `org_b`-Kontakt).

---

## Dateien

| Datei | Zweck |
|---|---|
| Create `supabase/migrations/20261117090000_contact_merge.sql` | `merge_contacts()`, `contact_refs()`, `contact_duplicates()`, Index, Guard-Ausnahmen |
| Modify `supabase/tests/isolation.sql` (CRM-Block, ab Zeile ~288) | Assertions für Merge + Duplikate |
| Create `src/contacts/merge.ts` | rein: wählbare Felder, Vorauswahl, Eingabe prüfen |
| Create `src/contacts/merge.test.mjs` | Tests dazu |
| Modify `src/contacts/server.ts` | `mergeContacts()` für Action + API |
| Modify `src/app/(app)/contacts/actions.ts` | Server Action `mergeContact` |
| Create `src/app/(app)/contacts/[id]/merge/page.tsx` | Merge-Seite |
| Create `src/app/(app)/contacts/duplicates/page.tsx` | Duplikat-Liste |
| Modify `src/app/(app)/contacts/[id]/page.tsx` | ⋯-Eintrag + Duplikat-Hinweis |
| Modify `src/modules/nav.ts` | Unterseite „Duplikate“ |
| Modify `src/api/v1/contacts.ts` | `POST /contacts/{id}/merge`, `GET /contacts/duplicates` |
| Modify `src/mcp/names.ts:31` | `merge` in `DANGER` |
| Modify `src/i18n/messages/de.json`, `en.json` | Texte + Fehlercodes |

---

### Task 1: Datenbank – Merge, Verweise zählen, Duplikate

**Files:**
- Create: `supabase/migrations/20261117090000_contact_merge.sql`
- Modify: `supabase/tests/isolation.sql` (CRM-Block)

**Interfaces:**
- Produces:
  - `public.merge_contacts(p_keep uuid, p_drop uuid, p_take text[] default '{}', p_note text default null) returns uuid` (gibt `p_keep` zurück)
  - `public.contact_refs(p_contact uuid) returns jsonb` → `{ "memberships": n, "tickets": n, "notes": n, "files": n, "documents": n, "shop_orders": n, "form_submissions": n, "courses": n, "rentals": n, "email_sends": n, "cash_entries": n, "artists": n, "staff": n }`
  - `public.contact_duplicates(p_limit int default 50, p_offset int default 0) returns table (a_id uuid, b_id uuid)` – Paare der aktiven Org, `a_id < b_id`
  - Fehlercodes: `merge_same`, `merge_not_found`, `membership_overlap` (gibt es schon), `not_allowed`

- [ ] **Step 1: Assertions in `isolation.sql` schreiben** (im CRM-Block, als Nutzer A mit `crm.manage` + `members.manage`; neue Kontakte mit eigenen E-Mails, damit bestehende Assertions unberührt bleiben):
  - `merge moves notes + memberships`: Kontakt K (keep) und D (drop) mit je einer Notiz, D mit einer Mitgliedschaft → nach `merge_contacts(K, D)`: `count(contact_notes where contact_id = K) = 2` (+1 für `p_note`, wenn gesetzt), Mitgliedschaft hat `contact_id = K`, D hat `deleted_at is not null`.
  - `take email + member_code`: D hat E-Mail `d@x.de` und `member_code`, `p_take = '{email,member_code}'` → K hat beide Werte, D hat `member_code is null`.
  - `tags union, opt-out wins`: K tags `{a}`, D tags `{A,b}` + `unsubscribed_at` gesetzt → K tags `{a,b}`, `unsubscribed_at is not null`.
  - `issued invoice moves, recipient frozen`: ausgestellte Rechnung an D (über `issue_document()` wie in bestehenden Rechnungs-Assertions) → nach Merge `contact_id = K`, `recipient_name` unverändert; ein normales `update documents set contact_id = …` außerhalb des Merge wirft weiterhin `document_locked`.
  - `overlap rolls back`: K und D mit überlappenden Mitgliedschaften → `merge_contacts` wirft `membership_overlap`, D ist danach noch live, Notizen unverändert.
  - `merge same / foreign`: `merge_contacts(K, K)` → `merge_same`; `merge_contacts(K, <Kontakt aus org_b>)` → `merge_not_found`.
  - `merge needs crm.manage`: als Nutzer C (ohne crm) → `not_allowed`.
  - `merge starts no workflow runs`: aktiver Workflow mit `trigger_type = 'record:memberships:update'` in org_a → nach Merge kein neuer `workflow_runs`-Eintrag.
  - `duplicates by name`: zwei live Kontakte „Anna Muster“ / „anna  muster “ → `contact_duplicates()` liefert genau dieses Paar; nach Merge nicht mehr. Als Nutzer B → 0 Zeilen.

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `npm run db:test`
Expected: FAIL (`function public.merge_contacts … does not exist`)

- [ ] **Step 3: Migration schreiben**

`merge_contacts` – `language plpgsql security definer set search_path = ''`, Ablauf:
1. Beide Zeilen `for update` laden (live, gleiche Org); sonst `merge_not_found`; `p_keep = p_drop` → `merge_same`.
2. `has_perm(org, 'crm.manage')` und `module_enabled(org, 'crm')`, sonst `not_allowed`. Hat D Mitgliedschaften: zusätzlich `has_perm(org, 'members.manage')`.
3. `perform set_config('roots.merging', 'on', true)`.
4. Verweise umhängen (`update … set contact_id = p_keep where contact_id = p_drop`): `memberships`, `tickets`, `contact_notes`, `documents`, `email_sends`, `form_submissions`, `shop_orders`, `cash_entries`, `workflow_runs`, `artists`, `staff`. `files` und `project_links`: `entity = 'contacts' and entity_id = p_drop` → `p_keep` (bei `project_links` vorher Duplikate von D löschen, Unique `(project_id, entity, entity_id)`). `course_participants`/`rental_contacts`: wo K schon im selben Kurs/derselben Vermietung ist, zuerst `course_attendance` von D's Teilnahme auf K's Teilnahme umhängen (wo kein Konflikt `(session_id, participant_id)`), dann D's Zeile löschen; übrige umhängen. `portal_tokens` von D löschen.
5. D in den Papierkorb: `deleted_at = now()`, und `member_code`/`user_id`/`email` auf null, wenn sie in `p_take` stehen (Unique-Werte frei machen). Direktes Update statt `soft_delete()`, Rechte sind in 2. geprüft.
6. K aktualisieren: für jeden Schlüssel in `p_take` den Wert von D (`address` = `street, postal_code, city, country` zusammen; `custom.<key>` = einzelner Schlüssel in `custom`); `tags` = Vereinigung ohne Groß-/Kleinschreibungs-Duplikate (K's Schreibweise gewinnt), höchstens 50; `unsubscribed_at` = `least()` der beiden (null ignorieren).
7. `p_note` nicht null → `contact_notes`-Zeile an K (Text kommt übersetzt aus der App).
8. `return p_keep`.

Guard-Ausnahmen (in derselben Migration, jeweils die **letzte** Definition kopieren, `grep -l` über `supabase/migrations`):
- `documents_guard()` (letzte Fassung in `20261103100000_shop.sql:288`): im eingefrorenen Tupel `new.contact_id`/`old.contact_id` nur vergleichen, wenn `current_setting('roots.merging', true) is distinct from 'on'`.
- `workflow_runs_from_changes()` (`20261013160000_workflow_record_triggers.sql`): `return null`, wenn `current_setting('roots.merging', true) = 'on'`.

`contact_refs(p_contact)` – security definer, prüft `has_perm(org, 'crm.view')`, zählt die Tabellen aus 4. (Kurse/Vermietungen als Anzahl Zeilen, Dateien über `entity`).

`contact_duplicates(p_limit, p_offset)` – `security invoker`, `stable`: Selbst-Join live Kontakte der `public.request_org()` auf den normalisierten Vor- und Nachnamen `lower(regexp_replace(btrim(x), '\s+', ' ', 'g'))` (beide nicht leer), `a.id < b.id`, sortiert nach Nachname. Index mit genau diesem Ausdruck: `create index contacts_org_fullname on public.contacts (org_id, lower(regexp_replace(btrim(last_name), '\s+', ' ', 'g')), lower(regexp_replace(btrim(first_name), '\s+', ' ', 'g'))) where deleted_at is null;`. Über die Key-API (Service-Rolle) filtert `request_org()` aus `x-org-id` die Org.

Rechte: `revoke execute … from public, anon`; `grant execute … to authenticated, service_role` für alle drei.

- [ ] **Step 4: Migration anwenden, Typen, Tests, Advisors**

Run: `npm run db:push && npm run db:types && npm run db:test`
Expected: `isolation: all checks passed`. Danach MCP `get_advisors` (security + performance): keine neuen Warnungen zu den drei Funktionen.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261117090000_contact_merge.sql supabase/tests/isolation.sql src/lib/supabase/types.ts
git commit -m "Contacts: merge_contacts() moves everything to one contact, contact_duplicates() by name"
```

---

### Task 2: Reine Merge-Logik

**Files:**
- Create: `src/contacts/merge.ts`
- Test: `src/contacts/merge.test.mjs`

**Interfaces:**
- Produces:
  - `MERGE_FIELDS: readonly ["first_name", "last_name", "company", "email", "phone", "address", "birthday", "member_code", "user_id"]`
  - `type MergeContact = { first_name, last_name, company, email, phone, street, postal_code, city, country, birthday, member_code, user_id: string | null; custom: Record<string, unknown> }`
  - `mergeValue(c: MergeContact, key: string): string` – Anzeigewert (`address` = „Straße, PLZ Ort, Land“; `custom.<k>`), `""` = leer
  - `defaultTake(keep: MergeContact, drop: MergeContact, customKeys: string[]): string[]` – Schlüssel, bei denen K leer und D nicht leer ist
  - `conflicts(keep, drop, customKeys): string[]` – Schlüssel, bei denen beide nicht leer und verschieden sind (nur diese zeigt die Seite zur Auswahl)
  - `readTake(raw: unknown, customKeys: string[]): string[] | null` – Array aus erlaubten Schlüsseln (`MERGE_FIELDS` + `custom.<key>` für bekannte Keys), ohne Doppelte; sonst `null`

- [ ] **Step 1: Tests schreiben** (`import { … } from "./merge.ts"`):
  - `defaultTake fills empty fields`: K `{ phone: null }`, D `{ phone: "030 1" }` → enthält `"phone"`; K und D beide mit E-Mail → enthält `"email"` nicht.
  - `address is one field`: K nur `city`, D voll → `defaultTake` enthält `"address"` nicht (K nicht leer); `conflicts` enthält `"address"`.
  - `conflicts ignores equal values`: beide `first_name: "Anna"` → nicht in `conflicts`.
  - `custom keys`: D `custom: { dj_name: "X" }`, K leer → `defaultTake(…, ["dj_name"])` enthält `"custom.dj_name"`.
  - `readTake rejects unknown`: `readTake(["email", "custom.nope"], ["dj_name"])` → `null`; `readTake("email", [])` → `null`; `readTake(["email","email"], [])` → `["email"]`.

- [ ] **Step 2: Test laufen lassen, muss fehlschlagen**

Run: `node --test src/contacts/merge.test.mjs`
Expected: FAIL (Modul fehlt)

- [ ] **Step 3: `src/contacts/merge.ts` implementieren** (nur relative `.ts`-Imports, damit `node --test` läuft).

- [ ] **Step 4: Test laufen lassen**

Run: `node --test src/contacts/merge.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/contacts/merge.ts src/contacts/merge.test.mjs
git commit -m "Contacts: pure merge rules (fields, defaults, conflicts, input check)"
```

---

### Task 3: Server-Funktion, Server Action, API, MCP

**Files:**
- Modify: `src/contacts/server.ts`, `src/app/(app)/contacts/actions.ts`, `src/api/v1/contacts.ts`, `src/mcp/names.ts:31`
- Modify: `src/i18n/messages/de.json`, `en.json` (Fehlercodes)

**Interfaces:**
- Consumes: `merge_contacts`, `contact_duplicates` (Task 1), `readTake` (Task 2), `loadFields(db, orgId, "contacts")`
- Produces:
  - `mergeContacts(db: Db, orgId: string, input: { keepId: string; dropId: string; take: unknown; note: string | null }, t: T): Promise<{ error: string } | { id: string }>` in `src/contacts/server.ts`
  - Server Action `mergeContact(fd: FormData)` – Felder `id` (keep), `drop`, `take.<key>` = `"drop"` für jedes Feld, das vom zweiten kommt; Erfolg → `back("/contacts/<id>", { ok })`, Fehler → `back("/contacts/<id>/merge?with=<drop>", { error })`
  - `POST /contacts/{id}/merge` – body `{ merge_id: uuid, take?: string[] }`, response `Contact`, permission `crm.manage`
  - `GET /contacts/duplicates` – `limit`/`offset`, response `list({ a: Contact, b: Contact })`, permission `crm.view`

- [ ] **Step 1: `mergeContacts()` implementieren**: `readTake` mit den Custom-Keys der Org (sonst `errors.invalid_input`), dann `db.rpc("merge_contacts", { p_keep, p_drop, p_take, p_note })`, Fehler über `dbError(t, error)`. `note` baut der Aufrufer: `t("contacts.merge.note", { name, email })`.
- [ ] **Step 2: Server Action `mergeContact`** mit `requirePerm("crm.manage")`, `take` aus den `take.*`-Feldern; danach `deliverSoon()` nicht nötig (kein Event). Kein `refreshPublic` (Kontakte sind nicht öffentlich).
- [ ] **Step 3: Endpoints** in `src/api/v1/contacts.ts` neben `/contacts/{id}/restore`. `summary`: „Merge another contact into this one“; `description`: was wandert (Liste aus Task 1, Schritt 3.4), dass der andere Kontakt in den Papierkorb geht, `take` = Felder, die vom anderen kommen (`address` umfasst Straße/PLZ/Ort/Land, `custom.<key>`), Tags werden vereinigt, Abmeldung bleibt bestehen, 409 bei überlappenden Mitgliedschaften. Fehler `membership_overlap` → `ApiError` 409, `merge_not_found` → `notFound()`. Duplikate: Paare per `contact_duplicates`, dann beide Kontakte in **einem** `select … in (ids)` mit `.eq("org_id", orgId)` nachladen.
- [ ] **Step 4: MCP**: in `src/mcp/names.ts:31` `merge` in die `DANGER`-Regex aufnehmen.
- [ ] **Step 5: Fehlertexte** `errors.merge_same`, `errors.merge_not_found` in `de.json` + `en.json` (`membership_overlap` prüfen, ob vorhanden).
- [ ] **Step 6: Prüfen**

Run: `npm run lint && npm test`
Expected: beides grün. Dann im Dev-Server mit einem Key der **Domes-Testorg**: `GET /api/docs` zeigt beide Endpoints; MCP `roots_find_operations` mit „merge“ listet die Operation als danger.

- [ ] **Step 7: Commit**

```bash
git add src/contacts/server.ts "src/app/(app)/contacts/actions.ts" src/api/v1/contacts.ts src/mcp/names.ts src/i18n/messages
git commit -m "Contacts: merge via action, API (POST /contacts/{id}/merge, GET /contacts/duplicates) and MCP (danger)"
```

---

### Task 4: Merge-Seite und Einstieg am Kontakt

**Files:**
- Create: `src/app/(app)/contacts/[id]/merge/page.tsx`
- Modify: `src/app/(app)/contacts/[id]/page.tsx` (⋯-Menü Zeile ~114, Duplikat-Hinweis)
- Modify: `de.json`, `en.json` (`contacts.merge.*`)

**Interfaces:**
- Consumes: `mergeContact` (Task 3), `conflicts`, `defaultTake`, `mergeValue` (Task 2), `contact_refs` (Task 1), `<ContactPicker>`

- [ ] **Step 1: Seite `/contacts/<id>/merge`** (`requirePerm("crm.manage")`, `<Page size="form">`, `crumbs` Kontakte › Name › „Zusammenführen“, `instant = false` wie die anderen Request-Seiten):
  - Ohne `?with=`: GET-Formular mit `<ContactPicker name="with">` + „Weiter“; gewählter Kontakt = `id` → Fehler `merge_same`.
  - Mit `?with=<drop>`: beide Kontakte + Custom-Felddefinitionen + `contact_refs(drop)` per `Promise.all`. Oben eine Zeile „<D> wird in <K> übernommen“ und ein Link „Tauschen“ → `/contacts/<with>/merge?with=<id>`. Für jeden Schlüssel aus `conflicts()` eine `<FormCard>` mit zwei Radio-Optionen (`name="take.<key>"`, Werte `keep` | `drop`, Vorauswahl `keep`), auf Telefonen untereinander. Felder aus `defaultTake()` als versteckte `take.<key>=drop`. Danach `<DetailList>` „Wird übertragen“ mit den Zählern > 0. Hinweis, wenn beide `member_code` haben: „Nur eine Mitgliedskarte bleibt gültig.“
  - Absenden: `<SubmitButton data-confirm="contacts.merge.confirm">` „Zusammenführen“; Bestätigungstext sagt, dass D in den Papierkorb geht.
- [ ] **Step 2: Einstieg am Kontakt**: im ⋯-Menü `MenuLink href="/contacts/<id>/merge"` mit `MergeIcon` (lucide), nur bei `ctx.can("crm.manage")`, vor dem Löschen-Eintrag. Hinweis-Karte in der Seitenspalte, wenn ein anderer live Kontakt denselben Vor- + Nachnamen hat (eine Abfrage im bestehenden `Promise.all`, `ilike` auf beide Namen, `neq id`, `limit 3`): „Mögliches Duplikat: <Name>“ → Link `/contacts/<id>/merge?with=<other>`.
- [ ] **Step 3: Texte** `contacts.merge.{title, action, pick, next, swap, into, keepThis, takeOther, moves, cardWarning, confirm, confirmHint, done, note, duplicateHint}` in beiden Sprachdateien.
- [ ] **Step 4: Prüfen** im Dev-Server, **Domes-Testorg**: zwei Kontakte anlegen (einer mit Mitgliedschaft + Notiz + Datei), zusammenführen → Toast, Daten am verbliebenen Kontakt, anderer im Papierkorb. Überlappende Mitgliedschaften → Fehler-Toast, nichts geändert. Bei 375 px, 768 px, 1280 px, hell + dunkel ansehen.

Run: `npm run lint`
Expected: grün

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/contacts/[id]" src/i18n/messages
git commit -m "Contacts: merge page (pick fields, see what moves) + entry and duplicate hint on the contact"
```

---

### Task 5: Duplikat-Liste

**Files:**
- Create: `src/app/(app)/contacts/duplicates/page.tsx` (+ `loading.tsx`, falls die Kontakte keinen gemeinsamen haben)
- Modify: `src/modules/nav.ts:39` (Unterseite), `de.json`, `en.json`

**Interfaces:**
- Consumes: `contact_duplicates` (Task 1)

- [ ] **Step 1: Seite** (`requirePerm("crm.view")`, `<Page size="list">`, `area` Kontakte): `<DataTable>` mit Spalten „Kontakt A“, „Kontakt B“ (Name + E-Mail, Links auf die Kontakte), „Zusammenführen“ (Link `/contacts/<a>/merge?with=<b>`, nur mit `crm.manage`); `<Pager>` über `?page=` (50 pro Seite, `p_offset`). Keine Paare → `<EmptyState>` „Keine möglichen Duplikate“.
- [ ] **Step 2: Nav-Eintrag** `{ href: "/contacts/duplicates", label: "contacts.duplicates.nav", module: "crm", permission: "crm.view" }` vor dem Einstellungen-Eintrag (bringt auch die ⌘K-Suche).
- [ ] **Step 3: Texte** `contacts.duplicates.{nav, title, a, b, empty, emptyText}`.
- [ ] **Step 4: Prüfen** (Domes-Testorg): zwei „Anna Muster“ → ein Paar; nach dem Zusammenführen leer. Telefon: Karten statt Tabelle.

Run: `npm run lint && npm test`
Expected: grün

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/contacts/duplicates" src/modules/nav.ts src/i18n/messages
git commit -m "Contacts: list of possible duplicates (same first + last name)"
```

---

### Task 6: Abschluss

- [ ] **Step 1:** Dev-Server stoppen, dann `npm run build` (muss grün sein), Dev neu starten.
- [ ] **Step 2:** `npm run db:test` noch einmal, MCP `get_advisors`.
- [ ] **Step 3:** PR gegen `main`, Beschreibung verweist auf giwdal/roots#27 und die s03-Zeilen in giwdal/roots#31.

---

## Bewusst nicht in diesem Plan

- **Formulare/Import gleichen automatisch nach Namen ab** (#31 s03 „Abgleich nach Namen“): automatisches Zusammenlegen nach Namen würde zwei echte „Anna Müller“ vermischen. Unklare Treffer klärt die Boxoffice laut #31 per Hand: dafür sind Duplikat-Liste und Hinweis am Kontakt da. Der Hinweis „schon Mitglied“ im Formular gehört zu #18/#22.
- **„Kein Duplikat“ markieren**: erst bauen, wenn die Liste durch gleichnamige echte Personen unübersichtlich wird (bräuchte eine eigene Tabelle).
- **Alte Links auf den zusammengeführten Kontakt weiterleiten** (`merged_into`): der Papierkorb + Änderungsprotokoll halten die Herkunft fest; Links in alten Benachrichtigungen landen auf „nicht gefunden“.
- **Kundenportal „Meine Tickets“** sucht Bestellungen per E-Mail: Bestellungen unter der verworfenen E-Mail-Adresse erscheinen dort nicht mehr (Tickets selbst sind umgehängt).
- Wird der verworfene Kontakt aus dem Papierkorb geholt, kommt er leer zurück (alles hängt am anderen) – harmlos, nicht gesperrt.
