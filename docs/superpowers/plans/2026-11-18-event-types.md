# Event-Typen mit Voreinstellungen – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Org verwaltet eigene Event-Typen (Name, Slug, Farbe, Voreinstellungen). Beim Anlegen eines Events ist der Typ das erste Feld und füllt die Einstellungen vor. Der Typ ist am Event gespeichert und in App, Key-API, Kalender, Liste und Tür sichtbar. Damit wird die Zählregel für Besuchslimits (PR 42, Issue #17) eine allgemeine Eigenschaft des Typs und nicht Coppi-Logik.

**Architecture:** Neue Tabelle `event_types` je Org. Voreinstellungen sind einfache Spalten am Typ, die Eventspalten spiegeln. Es gibt nur Voreinstellungen für Felder, die im Anlegen-Formular sichtbar sind (`counts_visit`, `capacity`), keine versteckten. Sie werden beim Anlegen ins Event **kopiert** (kein Vererben): Das Event hält seine eigenen Werte, die Tür und alles andere lesen weiter nur `events.*`. `events.event_type_id` ist ein Attribut für Filter, Farbe und Anzeige. Ein zusammengesetzter Fremdschlüssel `(event_type_id, org_id)` hält die Org-Grenze in der Datenbank. Im App-Formular wechselt der Typ die Vorbelegung im Browser (die eingetippten Daten bleiben erhalten); die Key-API nutzt denselben reinen Helfer für fehlende Felder.

**Tech Stack:** Postgres (Supabase-Migrationen, RLS), Next.js 16 Server Components/Actions, zod (Key-API), node --test.

**Spec:** Chat-Entscheidungen vom 18.11.2026 (Event-Typen org-eigen; Typ als erstes Feld mit Vorbelegung; API mit `event_type_id` und `slug`), `docs/superpowers/plans/2026-11-18-door-visit-limit.md` (PR 42), Issues #15, #17, #19, #24. Regeln: `AGENTS.md`, `docs/design/app.md`.

## Global Constraints

- Arbeit im Worktree `/Users/dominikeisert/__coding/claude/claude_projects/roots-visit-limit`, Branch `feat/visit-limit` (baut auf PR 42 auf, Umbau vor dem Merge). Nicht im Haupt-Checkout.
- Migration: neue Datei `supabase/migrations/20261118150000_event_types.sql`. Danach `npm run db:push`, `npm run db:types`, `npm run db:test` (muss „isolation: all checks passed“ ausgeben). Die zwei untracked Migrationen `20261118120000_*` und `20261118130000_*` im Worktree **nicht** committen.
- `events.counts_visit` aus PR 42 bleibt (die Tür liest es). Nur die sichtbare Beschriftung wird allgemein: de „Zählt für Besuchslimits“, en „Counts towards visit limits“ (`eventsPage.countsVisit`, Hinweis `eventsPage.countsVisitHint` anpassen, `automations.fields.event.counts_visit`).
- Berechtigung für Typen: `events.manage` (schreiben), `events.view` (lesen). Seite `/events/settings` als letzter Sidebar-Punkt der Events-Area (`common.settings`).
- Kein „Coppi“ und kein „Probe“ in Code-Bezeichnern. Keine Rohfarben: Farben sind Namen aus `STATUS_COLORS` (`src/projects/fields.ts`, relativ importieren: die Datei hat keine eigenen Importe), dargestellt über `DOT`. Keine doppelte Farbliste.
- Jeder neue Text in `src/i18n/messages/de.json` **und** `en.json`. Typen stehen nicht auf öffentlichen Seiten, deshalb kein `refreshPublic` und kein Public-API-Endpoint. Die neue Spalte `events.event_type_id` bekommt **keinen** `anon`-Grant (`events` hat nur Spalten-Grants für `anon`); das prüft ein Test in Task 1.
- Nicht in Coppi testen, nur in der Domes-Testorg (`roots-dome-test`). Kein `npm run build`, solange `next dev` läuft (Dev-Server vorher stoppen).
- `npm run lint`, `npm test`, `npm run build` vor dem letzten Commit. Commits ohne KI-Attribution (AGENTS.md).

## Datenmodell (gilt in allen Tasks)

`public.event_types`:

| Spalte | Typ | Bedeutung |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | |
| `org_id` | uuid not null → orgs on delete cascade | |
| `name` | text not null, 1–100 Zeichen | |
| `slug` | text not null, Regex `^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$` | je Org eindeutig; aus dem Namen erzeugt (`slugify` aus `events/slug.ts`) |
| `color` | text null, einer von `STATUS_COLORS` | null = keine Farbe |
| `active` | boolean not null default true | inaktive Typen sind bei neuen Events nicht wählbar |
| `counts_visit` | boolean not null default true | Voreinstellung für `events.counts_visit` |
| `capacity` | int null, ≥ 1 | Voreinstellung für `events.capacity`; null = nicht voreingestellt |
| Audit | `created_at/by`, `updated_at/by` | + `select public.enable_audit('public.event_types')` |

Constraints: `unique (org_id, slug)`, `unique (id, org_id)`.
`events.event_type_id uuid null`, Fremdschlüssel `(event_type_id, org_id) references public.event_types (id, org_id)` (kein `on delete cascade`, also `restrict`), Index auf `(org_id, event_type_id)`.

Anwenden beim Anlegen:
- **App:** Das Formular postet immer alle seine Felder. Deshalb wirkt die Vorbelegung über das Formular selbst (Task 4): Wechselt man den Typ, übernehmen `capacity` und `counts_visit` im Browser die Werte des Typs, solange man sie nicht selbst angefasst hat; gespeichert wird, was im Formular steht. Nur wenn das Feld `counts_visit` fehlt (Mitglieder-Modul aus), setzt `createEvent` den Wert des Typs.
- **API:** Ein Wert, den der Body **nicht** setzt (`undefined`), kommt aus dem Typ; was gesetzt ist (auch `null`), gewinnt.
- Weitere Voreinstellungen (Ticketnamen, max. Tickets, Standardlisten, Preise) kommen erst, wenn die Felder im Anlegen-Formular stehen.

## Review Focus

1. **Org-Grenze:** Ein Event einer Org darf keinen Typ einer anderen Org bekommen (App, API, direkter Insert). → SQL-Test in Task 1; manuelle API-Prüfung in Task 5.
2. **Typ löschen, solange Events ihn nutzen:** gesperrt mit verständlichem Fehler `type_in_use`. Löschen ohne Nutzung geht. → SQL-Test Task 1, Verhalten in Task 3.
3. **Überschreiben bei Vorbelegung:** Leert jemand die vorbelegte Kapazität oder ändert er den Haken, bleibt das so; ein späterer Typwechsel überschreibt nur Felder, die er nicht angefasst hat. In der API gewinnt ein gesetzter Body-Wert (auch `null`). → API-Semantik als Test in Task 2, Formularverhalten manuell in Task 4.
4. **Typ am bestehenden Event ändern:** wirkt nicht auf dessen Einstellungen, nur auf Typ-Attribut, Farbe und Filter. → manuell in Task 4 und 5 (Code: Defaults nur in `createEvent` und `POST /events`).
5. **Slug:** gleicher Name in einer Org ergibt einen zweiten eindeutigen Slug (Suffix); ein Ein-Buchstaben-Name ergibt trotzdem einen gültigen Slug (mindestens 2 Zeichen); ein ungültiger Slug per API ist 422, ein doppelter 409, kein 500. → Test Task 2, Verhalten Task 5 (manuell).
6. **Typ ohne Voreinstellungen / Event ohne Typ:** funktioniert wie bisher, `counts_visit` bleibt `true`. → Test Task 2 und SQL-Test Task 1.
7. **Soft gelöschte Events** behalten ihren Typ und blockieren das Löschen des Typs; die Meldung sagt das. → Task 3.
8. **Ein Event ohne Berechtigung auf Typen:** Wer `events.view` nicht hat, sieht keine Typen (RLS). → SQL-Test Task 1.

---

### Task 1: Datenbank – Tabelle, Fremdschlüssel, RLS

**Files:**
- Create: `supabase/migrations/20261118150000_event_types.sql`
- Modify: `supabase/tests/isolation.sql` (neuer Block vor dem abschließenden `raise exception 'isolation: all checks passed'`, nach dem Block „Visit limit at the door“)
- Modify: `src/automations/objects.ts` (Eintrag `event_type` in `OBJECTS`, siehe Task 5 Step 3, **schon hier**, sonst wird `npm test` rot: `objects.test.mjs` prüft jede Tabelle mit `enable_audit`)
- Modify: `src/i18n/messages/de.json`, `en.json` (`activity.tables.event_types`, `automations.objects.event_type`, `automations.fields.event_type.*`)
- Regenerate: `src/lib/supabase/types.ts`

**Interfaces:**
- Produces: Tabelle `event_types` und Spalte `events.event_type_id` wie in „Datenmodell“. Ein Löschen mit Verweis wirft SQLSTATE 23503 (die App übersetzt es in Task 3/5).

- [ ] **Step 1: Write the failing test** (Block in `isolation.sql`; Owner `a` in `org_a`, `b` in `org_b`, Events-Modul ist dort an)

```sql
-- Event types: per org, events may only use their own org's type, a type in use can't be deleted
declare v_ta uuid; v_tb uuid; v_e uuid;
begin
  insert into public.event_types (org_id, name, slug, counts_visit, capacity) values (org_a, 'Klubnacht', 'klubnacht', false, 300) returning id into v_ta;
  insert into public.event_types (org_id, name, slug) values (org_b, 'Fremd', 'fremd') returning id into v_tb;
  begin insert into public.event_types (org_id, name, slug) values (org_a, 'Dup', 'klubnacht'); assert false, 'slug unique per org';
  exception when unique_violation then null; end;
  begin insert into public.events (org_id, title, slug, starts_at, event_type_id) values (org_a, 'X', 'et-x', now(), v_tb); assert false, 'foreign type rejected';
  exception when foreign_key_violation then null; end;
  insert into public.events (org_id, title, slug, starts_at, event_type_id) values (org_a, 'Mit Typ', 'et-ok', now(), v_ta) returning id into v_e;
  begin delete from public.event_types where id = v_ta; assert false, 'type in use must not be deleted';
  exception when foreign_key_violation then null; end;
  select count(*) into n from public.events where id = v_e and counts_visit; assert n = 1, 'event without explicit flag keeps the default (type defaults are applied by the app, not the DB)';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from public.event_types where org_id = org_a; assert n = 0, 'B sees types of A';
  begin insert into public.event_types (org_id, name, slug) values (org_a, 'Hack', 'hack'); assert false, 'B wrote a type into A';
  exception when insufficient_privilege or check_violation then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true); -- global "Member" role: no permissions
  set local role authenticated;
  select count(*) into n from public.event_types where org_id = org_a; assert n = 0, 'a member without events.view sees no types';
  begin insert into public.event_types (org_id, name, slug) values (org_a, 'Member', 'member-x'); assert false, 'plain member wrote a type';
  exception when insufficient_privilege or check_violation then null; end;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true); -- the owner writes through the policies too
  set local role authenticated;
  insert into public.event_types (org_id, name, slug) values (org_a, 'Owner schreibt', 'owner-schreibt');
  update public.event_types set name = 'Owner schreibt 2' where org_id = org_a and slug = 'owner-schreibt';
  delete from public.event_types where org_id = org_a and slug = 'owner-schreibt';
  get diagnostics n = row_count;                              assert n = 1, 'owner deletes an unused type through the delete policy';
  reset role;
  assert not has_table_privilege('anon', 'public.event_types', 'select'), 'anon sees no types';
  assert not has_column_privilege('anon', 'public.events', 'event_type_id', 'select'), 'anon must not read events.event_type_id';
end;
```
(`c` hat die globale Rolle „Member“ ohne Rechte, siehe `global_roles.sql`; der Block läuft nach dem „Visit limit“-Block in `isolation.sql`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run db:test`
Expected: FAIL (`relation "public.event_types" does not exist`).

- [ ] **Step 3: Write the migration**

- `create table` wie in „Datenmodell“, `alter table … enable row level security`, `revoke all … from anon`.
- Policies nach `events_module.sql:28-34` und `membership_types` in `20261012110000_members.sql` (dort gibt es eine eigene `delete`-Policy): `select` mit `is_member`, `module_enabled(…, 'events')` und `has_perm(…, 'events.view')`; je eine eigene Policy für `insert`, `update`, `delete` mit `has_perm(…, 'events.manage')` und `module_enabled`. `revoke all on public.event_types from anon` und passende Grants für `authenticated`.
- `alter table public.events add column event_type_id uuid`, Fremdschlüssel wie beschrieben, Index.
- Fehlercode: ein Löschen mit Verweis wirft `foreign_key_violation` (SQLSTATE 23503). Die App übersetzt das (Task 3), die DB braucht dafür nichts weiter. Soft gelöschte Events behalten ihren Typ und blockieren das Löschen mit.
- Audit: `select public.enable_audit('public.event_types')`.

- [ ] **Step 4: Push + test**

Run: `npm run db:push && npm run db:types && npm run db:test`
Expected: `isolation: all checks passed`; `types.ts` enthält `event_types` und `event_type_id`; `npm test` bleibt grün (`objects.test.mjs`). MCP `get_advisors` (security + performance), falls Supabase-MCP verbunden ist, sonst im Bericht vermerken.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261118150000_event_types.sql supabase/tests/isolation.sql src/lib/supabase/types.ts src/automations/objects.ts src/i18n/messages
git commit -m "Event types: per-org table with defaults, events.event_type_id (same-org FK)"
```

### Task 2: Reine Regeln – Eingaben lesen, Voreinstellungen anwenden

**Files:**
- Create: `src/app/(app)/events/type-fields.ts` (pure, nur relative `.ts`-Importe)
- Create: `src/app/(app)/events/type-fields.test.mjs`

**Interfaces:**
- Consumes: `slugify` aus `./slug.ts` (mit `.ts`-Endung, sonst ist die Datei nicht per `node --test` ladbar; `events/fields.ts` importiert `./slug` ohne Endung und taugt dafür nicht), `STATUS_COLORS` per relativem Import `../../../projects/fields.ts`
- Produces:
  - `export type TypeInput = { name?: unknown; slug?: unknown; color?: unknown; active?: unknown; counts_visit?: unknown; capacity?: unknown }`
  - `export function readEventType(input: TypeInput, existingSlugs: string[]): { row: { name: string; slug: string; color: string | null; active: boolean; counts_visit: boolean; capacity: number | null } } | { error: string }` — `error` ist ein `errors.*`-Schlüssel; leere Slug-Eingabe erzeugt einen aus dem Namen (mindestens 2 Zeichen, bei einem Zeichen oder leerem Ergebnis wird `typ` bzw. `<zeichen>-typ` verwendet), bei Kollision mit `existingSlugs` wird `-2`, `-3` … angehängt
  - `export type TypeDefaults = { counts_visit: boolean; capacity: number | null }`
  - `export function withTypeDefaults<T extends Record<string, unknown>>(type: TypeDefaults | null, row: T): T & Partial<TypeDefaults>` — setzt nur Schlüssel, die in `row` **fehlen** (`undefined`) und im Typ nicht `null` sind. Wird von `POST /events` und, wenn `counts_visit` im Formular fehlt, von `createEvent` genutzt

- [ ] **Step 1: Write the failing tests** (`type-fields.test.mjs`, Namen und Behauptungen)

```js
test("slug is made from the name and stays unique per org", () => {
  assert.equal(readEventType({ name: "Klub Nacht" }, []).row.slug, "klub-nacht")
  assert.equal(readEventType({ name: "Klub Nacht" }, ["klub-nacht"]).row.slug, "klub-nacht-2")
  assert.equal(readEventType({ name: "X", slug: "Eigener Slug!" }, []).error, "errors.invalid_input")
})
test("name is required, colour must be known, numbers are ranged", () => {
  assert.equal(readEventType({ name: " " }, []).error, "errors.invalid_input")
  assert.equal(readEventType({ name: "A", color: "neon" }, []).error, "errors.invalid_input")
  assert.equal(readEventType({ name: "A", capacity: 0 }, []).error, "errors.invalid_input")
  assert.match(readEventType({ name: "A" }, []).row.slug, /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/) // one-letter name still gives a valid slug
  assert.equal(readEventType({ name: "A" }, []).row.counts_visit, true) // default
})
test("type defaults fill what the row leaves out, the row wins (API semantics)", () => {
  const t = { counts_visit: false, capacity: 300 }
  assert.deepEqual(withTypeDefaults(t, { title: "x" }), { title: "x", counts_visit: false, capacity: 300 })
  assert.equal(withTypeDefaults(t, { capacity: null }).capacity, null) // cleared on purpose = stays cleared
  assert.equal(withTypeDefaults(t, { counts_visit: true }).counts_visit, true)
  assert.deepEqual(withTypeDefaults(null, { title: "x" }), { title: "x" }) // no type = no change
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implement** `readEventType` und `withTypeDefaults` wie in den Signaturen. `capacity` aus Formularen kommt als String: leer → `null`, sonst ganze Zahl ≥ 1. Booleans akzeptieren `true`/`"on"`.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/events/type-fields.ts" "src/app/(app)/events/type-fields.test.mjs"
git commit -m "Event types: pure rules (read input, unique slug, apply defaults on create)"
```

### Task 3: Einstellungen – Typen verwalten

**Files:**
- Create: `src/app/(app)/events/settings/page.tsx` (+ `loading.tsx` wie bei `members/settings`)
- Modify: `src/app/(app)/events/actions.ts` (`saveEventType`, `deleteEventType`)
- Modify: `src/modules/nav.ts` (Events-Area: letzter Punkt `/events/settings`, Label `common.settings`, Modul `events`, Permission `events.manage`)
- Modify: `src/i18n/messages/de.json`, `en.json` (neue Texte unter `eventTypes.*`; `activity.tables.event_types` ist schon aus Task 1)

**Interfaces:**
- Consumes: `readEventType`, `TypeDefaults` (Task 2); Struktur von `src/app/(app)/members/types/page.tsx` + `members/actions.ts` (`saveType`, `deleteType`) kopieren, aber Auswahlfelder als `<Choice>` (nicht `NativeSelect`, `docs/design/app.md`)
- Produces: `saveEventType(fd: FormData)`, `deleteEventType(fd: FormData)`; Seite `/events/settings` mit `?new=type` und `?edit=<id>`

- [ ] **Step 1: Texte** (de / en, Schlüssel unter `eventTypes`): `title` „Event-Typen“ / „Event types“, `new` „Neuer Typ“ / „New type“, `name`, `slug` + `slugHint` („Kurzname für die API, z. B. klubnacht“), `color`, `active`, `defaults` „Voreinstellungen für neue Events“ / „Defaults for new events“, `defaultsHint` („Gilt nur beim Anlegen. Spätere Änderungen am Typ ändern bestehende Events nicht.“), `countsVisit` = „Zählt für Besuchslimits“ (wie `eventsPage.countsVisit`), `empty`, `inUse` („Dieser Typ wird noch von Events genutzt, auch von gelöschten im Papierkorb. Deaktiviere ihn stattdessen.“ / en entsprechend), `saved`, `deleted`. Keine Standardtypen: eine neue Org startet mit leerer Liste und `<EmptyState>` + „+ Neuer Typ“.

- [ ] **Step 2: Seite**
  - Liste mit `<DataTable>` (Name mit Farbpunkt `DOT[color]`, Slug, „zählt“-Badge, Anzahl Events je Typ), Zeile verlinkt `?edit=<id>`, Primäraktion „+ Neuer Typ“ (`?new=type`).
  - `<UrlSheet params={["new","edit"]}>` mit Formular: Name, Slug (optional), Farbe (`<Choice>` über `STATUS_COLORS`), Aktiv (nur beim Bearbeiten), dann FormCard „Voreinstellungen“ mit Checkbox `counts_visit`, `<TypedInput kind="number">` für die Kapazität. `<SaveBar>` (Create: `always`), Löschen als rotes ⋯-Item (`MenuSubmit`, `data-confirm`).
  - Leere Liste: `<EmptyState>` mit dem Button „+ Neuer Typ“.
  - Seite nur mit `requirePerm("events.manage")` und Events-Modul.

- [ ] **Step 3: Actions** (Muster `saveType`): Eingabe über `readEventType(…, existingSlugs der Org)`, Insert/Update mit `org_id`, Fehlerrückgabe über `back(path, { error | ok })`. Doppelter Slug trotz Vorabprüfung (Fehler 23505, Race) → `errors.slug_taken`. `deleteEventType`: Fehler 23503 → Meldung `eventTypes.inUse`. Keine Aufrufe von `refreshPublic`.

- [ ] **Step 4: Prüfen**

Run: `npx tsc --noEmit` (Fehler zu `PageProps` ignorieren, sie fehlen ohne generierte Next-Typen) und `npm run lint`.
Manuell (Dev-Server, Domes-Org, 375 und 1280 px): Typ anlegen, einen Typ bearbeiten, Slug-Kollision, Löschen eines genutzten Typs zeigt die Meldung.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/events/settings" "src/app/(app)/events/actions.ts" src/modules/nav.ts src/i18n/messages
git commit -m "Event types: manage them in Events → Einstellungen"
```

### Task 4: Event anlegen und anzeigen

**Files:**
- Create: `src/app/(app)/events/type-fields-input.tsx` (Client-Komponente `TypeAndDefaults`)
- Modify: `src/app/(app)/events/new/page.tsx`, `src/app/(app)/events/event-form.tsx`, `src/app/(app)/events/actions.ts` (`readEvent`, `createEvent`, `updateEvent`)
- Modify: `src/app/(app)/events/page.tsx` (Spalte/Badge, Filter `?type=<slug>`), `src/app/(app)/events/[eventId]/page.tsx` bzw. `layout.tsx` (Typ im Header)
- Modify: `src/calendar/sources.ts` (Farbe)
- Modify: `src/app/(app)/scan/page.tsx` (Typ-Etikett beim Event)

**Interfaces:**
- Consumes: `withTypeDefaults`, `TypeDefaults` (Task 2); `event_types` (Task 1)
- Produces: Formularfeld `event_type` (Typ-ID, leer = kein Typ); `/events/new?type=<slug>` als Einstiegslink; `TypeAndDefaults({ types, initialSlug, ev? })` (Client)

- [ ] **Step 1: Neues Event – Typ zuerst, ohne Datenverlust.** `new/page.tsx` lädt die aktiven Typen der Org (id, name, slug, color, counts_visit, capacity) und reicht sie an `EventForm` (`types`, `initialSlug` aus `?type=<slug>`). Im **Anlegen-Modus** steht als erste Karte ein Block „Typ“ mit der Client-Komponente `TypeAndDefaults`: `<Choice name="event_type">` plus **Kapazität** (`name="capacity"`) und der Haken **Zählt für Besuchslimits** (`name="counts_visit"`, nur mit Mitglieder-Modul, mit Hidden-Feld `counts_visit_field`). Die Werte sind kontrolliert; wählt man einen Typ, übernehmen **nur die Felder, die man noch nicht selbst angefasst hat,** den Wert des Typs (ein Flag je Feld „angefasst“). Es gibt keinen Seiten-Reload, Titel, Daten usw. bleiben stehen. `?type=<slug>` setzt nur die Anfangsauswahl. Im **Bearbeiten-Modus** bleiben Kapazität und Haken wie bisher in der Karte „about“, und der Typ ist ein einfaches `<Choice>` ohne Vorbelegung. Ohne aktive Typen entfällt der Block, die Felder stehen wie heute in „about“.

- [ ] **Step 2: Speichern.** `readEvent` liest `event_type` (UUID oder leer) und gibt `event_type_id` zurück; `createEvent` **und** `updateEvent` schreiben es. Der Typ der Org wird geladen (`.eq("org_id", ctx.org.id)`, Fremd-ID oder unbekannt: Fehler `errors.invalid_input`). Voreinstellungen: Das Formular hat sie schon vorbelegt, gespeichert wird, was gepostet ist. Fehlt `counts_visit_field` (Mitglieder-Modul aus) und gibt es einen Typ, setzt `createEvent` `counts_visit` über `withTypeDefaults(typ, row)`. `updateEvent` wendet **keine** Voreinstellungen an (Review Focus 4). Inaktive Typen erscheinen in der Auswahl nur, wenn das Event sie schon hat.

- [ ] **Step 3: Anzeige.**
  - Event-Liste: Typ als Badge mit Farbpunkt in der Titelspalte, Filter `<FilterMenu>` „Typ“ (`?type=<slug>`, in der Abfrage über `event_types!inner(slug)` oder zuvor ermittelte ID).
  - Event-Seite: Typ im Header (`badge`/`meta`) und als Auswahl im Formular.
  - Kalender: Farbe = `DOT[type.color]`, sonst wie bisher (Custom-Field-Färbung als Rückfall, dann `COLOR.events`). Das Select in `sources.ts:63` um `event_types(color)` erweitern, `colorOf` bekommt das Event statt nur `custom`.
  - Tür (`scan/page.tsx`): beim gewählten Event den Typnamen mit Farbpunkt zeigen, damit klar ist, ob es zählt (`events.counts_visit` steht schon auf der Mitgliederkarte).

- [ ] **Step 4: Prüfen**

Run: `npx tsc --noEmit` (ohne `PageProps`-Rauschen), `npm run lint`, `npm test`.
Manuell (Domes, 375/768/1280 px): `/events/new` zeigt den Typ als erstes Feld; „Klubnacht“ wählen füllt Kapazität und den Haken „Zählt für Besuchslimits“ vor, ohne dass Titel und Datum verschwinden; Haken ändern und danach den Typ wechseln lässt den angefassten Haken stehen; speichern übernimmt die Werte; Event ohne Typ speichert wie bisher; Filter und Farben stimmen.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/events" "src/app/(app)/scan/page.tsx" src/calendar/sources.ts
git commit -m "Events: type as first field with defaults, shown in list, page, calendar and door"
```

### Task 5: Key-API, Automationen, MCP

**Files:**
- Modify: `src/api/v1/events.ts` (Event-Schemas, Handler, neue Endpoints `/event-types…`) oder neue Datei `src/api/v1/event-types.ts` + Eintrag in `src/api/v1/index.ts`
- Modify (nur Nachzügler, der Katalog kam schon in Task 1): `src/automations/objects.ts`, `src/i18n/messages/*.json`

**Interfaces:**
- Consumes: `readEventType`, `withTypeDefaults` (Task 2)
- Produces (Key-API, Berechtigung `events.view` / `events.manage`):
  - `GET /event-types` (Liste, `active`-Filter), `GET /event-types/{id}`, `POST /event-types`, `PATCH /event-types/{id}`, `DELETE /event-types/{id}` (409 `type_in_use`)
  - Ein Typ in Antworten: `{ id, name, slug, color, active, counts_visit, capacity }`
  - Event-Antwort: zusätzlich `event_type_id` (uuid|null) und `event_type_slug` (string|null)
  - Event-Body (POST/PATCH): `event_type_id` **oder** `event_type_slug` (nicht beide: `.superRefine` auf dem `.strict()`-Schema, 422; unbekannt oder fremde Org: 422 `invalid_reference`, Muster `locationOf` in `events.ts:96-101`, die Slug-Auflösung mit `.eq("org_id", orgId)`). POST wendet **nach `clean()`** `withTypeDefaults` an und führt `checkEvent` auf der zusammengeführten Zeile aus (Kapazität); was im Body steht, gewinnt. PATCH ändert nur den Typ, nicht die Werte des Events.
  - `GET /events?event_type_id=…` und `?event_type_slug=…` als Filter

- [ ] **Step 1: Prüfung.** Die Key-API hat keine HTTP-Tests im Repo; die Regeln stecken in den getesteten Helfern (Task 2). Manuell, im Bericht festhalten, mit dem MCP `roots-dome-test` nach dem Deploy (oder `curl` gegen den Dev-Server mit einem Domes-Key): Typ anlegen; Event mit `event_type_slug` anlegen und sehen, dass `capacity`/`counts_visit` aus dem Typ kommen; ein Body-Wert (auch `null`) überschreibt; `id` und `slug` zusammen → 422; fremde ID → 422; doppelter Typ-Slug → 409; Typ mit Events löschen → 409 `type_in_use`.

- [ ] **Step 2: Implementieren.** Endpoints als Daten (`endpoint({ method, path, permission, tag, summary, description, body, response, handler })`), jeder mit klarer `summary` und `description` (MCP, `src/mcp/names.ts` vergibt die Namen automatisch). Alle Abfragen mit `org_id = orgId`; ein Typ aus Body/Query wird auf seine Org geprüft. Fehler über `ApiError`/`dbError()`, Löschen mit Verweis → 409 `type_in_use`. `EVENT_COLS` (`events.ts:44`) bekommt `event_type_id` und das Embed `event_types(slug)`; `eventOut` (`events.ts:46`) macht daraus `event_type_slug` (Embed entfernen, Generic anpassen). Fehler abbilden: 23503 beim Löschen eines Typs → 409 `type_in_use` (wie `slugTaken`), 23505 bei doppeltem Typ-Slug → 409, 23503 durch den zusammengesetzten Fremdschlüssel → 422 `invalid_reference`.

- [ ] **Step 3: Automations-Katalog (kommt schon in Task 1, damit `npm test` grün bleibt).** `event_type: { table: "event_types", module: "events", fields: [text("name"), text("slug"), bool("counts_visit"), num("capacity")] }` in `OBJECTS`; am Objekt `event` `relations: { event_type_id: "event_type" }`. Texte `automations.objects.event_type` und `automations.fields.event_type.<key>` in de/en. `src/automations/objects.test.mjs` muss grün sein.

- [ ] **Step 4: Prüfen**

Run: `npm test && npm run lint && npx tsc --noEmit` (ohne `PageProps`-Rauschen).
Expected: grün. `/api/docs` listet die neuen Endpoints (nach Deploy bzw. im Dev-Server prüfen).

- [ ] **Step 5: Commit**

```bash
git add src/api/v1 src/automations/objects.ts src/i18n/messages
git commit -m "Event types: key API (types, event_type_id/slug on events)"
```

### Task 6: Abschluss und Testdaten

**Files:** keine Code-Änderung außer Nachzügler; Seed in Domes per MCP bzw. App.

- [ ] **Step 1: Gesamtprüfung.** Dev-Server stoppen, dann `npm run lint && npm test && npm run build`. Dev-Server danach wieder starten (`preview_start roots-dev-visit-limit`).
- [ ] **Step 2: Domes-Testdaten.** Typen „Session“ (zählt), „Klubnacht“ (zählt nicht, Farbe grau) in der Domes-Org anlegen (nach Deploy per MCP `event_types_create`, vorher in der App unter Events → Einstellungen). Die vier Testevents von vorhin dem passenden Typ zuordnen (die Klubnacht-Testveranstaltung bekommt „Klubnacht“). Danach den Ablauf aus dem PR-Test (Probe-Mitglied, Limit 2) durchspielen.
- [ ] **Step 3: PR und Issues.** PR-Beschreibung von #42 aktualisieren (Event-Typen statt Einzel-Schalter; `counts_visit` als Voreinstellung des Typs). Kommentare an #15 (Typ ist jetzt ein Systemfeld: Typen in Events → Einstellungen anlegen statt Custom Field) und #17.
- [ ] **Step 4: Commit/Push** der Nachzügler, Branch pushen.

## Im PR erwähnen

- `events.counts_visit` bleibt die Quelle für die Tür; der Typ liefert nur die Voreinstellung beim Anlegen.
- Der Kalender nutzt die Typ-Farbe, ohne Typ weiter die Custom-Field-Färbung.
- #15 und der Coppi-Doc-Eintrag „Typ als Custom Field“ sind zu ändern: Typen in der App anlegen.
- Nicht enthalten (später, nur auf Wunsch): Typ auf öffentlichen Seiten, weitere Voreinstellungen (Ticketnamen, max. Tickets, Standard-Gästelisten, Preise je Gruppe), sobald die Felder im Anlegen-Formular stehen; „Typ-Wechsel übernimmt Voreinstellungen“.
