# Probe-Besuchszähler an der Tür – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Tür zählt Mitgliederbesuche nur bei Veranstaltungen, die „als Besuch zählen“. Sie zeigt „x von N“ für Mitgliedsarten mit Besuchslimit und sperrt den Einlass, sobald das Limit erreicht ist. Mit `tickets.scan` lässt sich die Sperre bewusst übergehen (Override).

**Architecture:** Zwei allgemeine Felder: `events.counts_visit` (Schalter pro Veranstaltung) und `membership_types.visit_limit` (Limit pro Mitgliedsart). Gezählt wird live aus den Tickets in `member_door_rows()`, also ohne gespeicherten Zähler, der auseinanderlaufen kann. `member_door()` gibt `result: 'limit'` zurück und lässt nur mit `p_override` ein. Der Offline-Scanner wendet dieselbe Regel über einen reinen Helfer in `src/members/door.ts` an. Einlass, Tickets und Tür-Statistik bleiben unverändert, die echte Besucherzahl bleibt also vollständig.

**Tech Stack:** Postgres (plpgsql, Supabase-Migrationen), Next.js 16 Server Actions, React 19, zod (Key-API), node --test.

**Spec:** GitHub-Issue giwdal/roots#17 („Tür: Probe-Besuchszähler mit Sperre ab Besuch 4“) und die Entscheidungen aus dem Chat am 18.11.2026:
- Ein Besuch zählt nur bei Veranstaltungen mit `counts_visit = true`. Das gilt auch für den ersten Check-in.
- Für den Override reicht `tickets.scan`.
- Die echte Besucherzahl muss sichtbar bleiben: Nicht zählende Check-ins sind normale eingelassene Tickets und erscheinen in den Tür-Statistiken.
- Die Logik gehört in den Code, nicht in Automationen (wegen der Verzögerung bis zu einer Minute).

## Global Constraints

- Die Entscheidung „nur zählende Events zählen, auch der erste Check-in“ ersetzt den Satz im Issue „erster Check-in zählt immer“. Das steht so im PR.
- **Vor Task 1:** Die Migration `20261118120000_contact_custom_search.sql` ist schon auf der gemeinsamen Datenbank angewendet. Sie liegt aber nur untracked im Haupt-Checkout (Branch `feat/custom-field-search`). Liegt sie nicht im Worktree, lehnt `db:push` ab. Deshalb erst `feat/custom-field-search` nach `main` bringen, oder von diesem Branch abzweigen und im PR vermerken. Erst wenn `npx supabase migration list` lokal und remote gleich zeigt, beginnt Task 1.
- Branch: eigener Worktree `feat/visit-limit`. Im Haupt-Checkout liegen fremde, nicht committete Änderungen. Im Worktree `.env.local` aus dem Haupt-Checkout kopieren und `npm ci` laufen lassen, denn alle `db:*`-Skripte lesen `.env.local`.
- Migration: neue Datei `supabase/migrations/20261118140000_visit_limit.sql` (nach `20261118120000_contact_custom_search.sql`). Danach `npm run db:push`, `npm run db:types`, `npm run db:test` (muss „all checks passed“ ausgeben). MCP `get_advisors` nur, wenn Supabase-MCP angemeldet ist, sonst im Bericht erwähnen.
- Niemals in der Org Coppi testen, nur in der Domes-Testorg (Memory `never-test-in-coppi`).
- Kein `npm run build`, solange `next dev` läuft (Memory `no-build-while-dev-runs`).
- Kein Text fest im Code: jeden neuen String in `src/i18n/messages/de.json` **und** `en.json` eintragen.
- Kein „Coppi“ und kein „Probe“ in Code-Bezeichnern. UI-Texte dürfen „Probebesuche“ sagen.
- `npm run lint`, `npm test` und `npm run build` müssen vor dem letzten Commit durchlaufen.
- Commits ohne KI-Attribution (AGENTS.md hat Vorrang vor der Harness-Attribution).

## Bedeutung der Felder (überall dieselbe)

- `events.counts_visit boolean not null default true`: Dieses Event zählt für den Besuchszähler. Bestehende Events zählen damit weiter.
- `membership_types.visit_limit int null check (visit_limit between 1 and 1000)`: So viele zählende Besuche sind erlaubt, `null` = kein Limit.
- `visits` (in `member_door_rows`, Bedeutung **geändert**): eingelassene Mitglieder-Tickets bei Events mit `counts_visit`, deren Check-in (Datum in Europe/Berlin) am oder nach `starts_on` der aktuellen Mitgliedschaft liegt. `last_visit` und `checked_in_at` bleiben wie bisher und zählen über alle Events.
- Limit erreicht ⇔ `visit_limit is not null and visits >= visit_limit`. Gesperrt wird **nur bei zählenden Events**. Bei nicht zählenden Events (`event_counts = false`) bleibt die Tür offen, auch wenn das Limit erreicht ist (vom Nutzer bestätigt).
- Neue Zeilenfelder: `visit_limit` (int|null) und `event_counts` (bool, ob das abgefragte Event zählt).

## Review Focus

1. **Bereits drin + Limit**: Jemand ist schon eingelassen und wird erneut gescannt, das Limit ist jetzt erreicht. Erwartung: `already`, nicht `limit` (die Prüfung auf `already` kommt zuerst). → SQL-Test in Task 1.
2. **Nicht zählendes Event**: Das Einlassen erhöht `visits` nicht, aber das Ticket ist `used` und zählt in der Besucherzahl. → SQL-Test in Task 1.
3. **Mitgliedschaft neu begonnen**: Besuche vor `starts_on` der aktuellen Mitgliedschaft zählen nicht. → SQL-Test in Task 1.
4. **Offline am Limit**: Das Gerät zeigt `limit` ohne Verbindung. Ein Override wird als `member:<id>:override` eingereiht und beim Sync mit Override nachgetragen. Ein normales `member:<id>`, das beim Sync am Limit scheitert, wird zum Konflikt und nicht stillschweigend eingelassen. Nach einem Listen-Refresh bleibt eine eingereihte Person „drin“, auch mit Override. → Tests für `localAdmit` und `queuedMember` in Task 2; Scanner-Refresh in Task 3.
6. **Limit erreicht bei einem nicht zählenden Event**: Die Tür bleibt offen (`member`, Einlass `ok`). → SQL-Test in Task 1, Test für `localAdmit` in Task 2.
7. **anon darf `member_door` nicht ausführen**, auch nach dem Drop und Neuanlegen. → SQL-Test in Task 1.
5. **Mitgliedsart ohne Limit**: Es gibt keinen Zähler „x von N“ und keine Sperre. Die Karte zeigt wie bisher „n Besuche“, aber nur noch zählende. → Test für den Helfer in Task 2.

---

### Task 1: Datenbank – Felder, Zählung, Sperre, Override

**Files:**
- Create: `supabase/migrations/20261118140000_visit_limit.sql`
- Modify: `supabase/tests/isolation.sql` (neuer Block nach dem Abschnitt, der `members` einschaltet, ca. Zeile 609; `tickets` ist dort schon an)
- Regenerate: `src/lib/supabase/types.ts` (`npm run db:types`)

**Interfaces:**
- Produces:
  - Spalten `events.counts_visit`, `membership_types.visit_limit` (Bedeutung siehe oben)
  - `member_door_rows(p_org, p_event, p_contact)`: jede Zeile hat zusätzlich `visit_limit`, `event_counts`; `visits` mit der neuen Bedeutung
  - `member_door(p_event uuid, p_code text, p_contact uuid default null, p_admit boolean default false, p_override boolean default false) returns jsonb`; neues Ergebnis `'limit'`
  - `pay_orders.metadata` eines Tür-Einlasses: `{ door: true, override: <bool> }`
  - Payload `membership.checked_in`: `visits` = neuer Zählerstand

- [ ] **Step 1: Write the failing test** (Block in `isolation.sql`, als Owner `a` in `org_a`, wie im Ticket-Block um Zeile 387)

Aufbau: Mitgliedsart `visit_limit = 2`; Kontakt + Mitgliedschaft mit `starts_on = heute - 30 Tage`; ein alter Besuch vor `starts_on` (Event `e0` mit `counts_visit = true`: per `member_door(e0, '', v_contact, true)` einlassen, dann nach `reset role` das Ticket auf `checked_in_at = now() - interval '60 days'` setzen); Events `e1`, `e2`, `e3` mit `counts_visit = true`, `ex` und `ex2` mit `counts_visit = false`. Assertions:

```sql
v_j := public.member_door(e1, '', v_contact, false);           assert v_j->>'result' = 'member', 'lookup below limit';
assert (v_j->>'visits')::int = 0, 'visits before starts_on do not count';
assert (v_j->>'visit_limit')::int = 2, 'row carries the limit';
v_j := public.member_door(ex, '', v_contact, true);            assert v_j->>'result' = 'ok', 'non-counting event lets in';
assert (v_j->>'visits')::int = 0, 'non-counting check-in does not count';
select count(*) into n from public.tickets where event_id = ex and contact_id = v_contact and status = 'used';
assert n = 1, 'non-counting check-in is still a used ticket (real headcount)';
v_j := public.member_door(e1, '', v_contact, true);            assert (v_j->>'visits')::int = 1, 'counting check-in counts';
v_j := public.member_door(e2, '', v_contact, true);            assert (v_j->>'visits')::int = 2, 'second counts';
v_j := public.member_door(e2, '', v_contact, false);           assert v_j->>'result' = 'already', 'already beats limit';
v_j := public.member_door(ex2, '', v_contact, true);           assert v_j->>'result' = 'ok', 'non-counting event stays open at the limit';
assert not has_function_privilege('anon', 'public.member_door(uuid, text, uuid, boolean, boolean)', 'execute'), 'anon must not run member_door';
v_j := public.member_door(e3, '', v_contact, false);           assert v_j->>'result' = 'limit', 'lookup at limit';
v_j := public.member_door(e3, '', v_contact, true);            assert v_j->>'result' = 'limit', 'admit at limit blocked';
select count(*) into n from public.tickets where event_id = e3 and contact_id = v_contact; assert n = 0, 'blocked = no ticket';
v_j := public.member_door(e3, '', v_contact, true, true);      assert v_j->>'result' = 'ok', 'override lets in';
select count(*) into n from public.pay_orders where org_id = org_a and source_module = 'members' and (metadata->>'override')::boolean;
assert n = 1, 'override is recorded on the order';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run db:test`
Expected: FAIL (Spalte `counts_visit` existiert nicht bzw. die Funktionssignatur mit `p_override` fehlt).

- [ ] **Step 3: Write the migration**

- `alter table` für beide Spalten (Definitionen siehe oben).
- `create or replace function public.member_door_rows(...)`: im CTE `v` an `public.events e on e.id = k.event_id` joinen, außerdem an `cur` (über `contact_id`), damit `starts_on` bekannt ist. `n` wird `count(*) filter (where e.counts_visit and (k.checked_in_at at time zone 'Europe/Berlin')::date >= cur.starts_on)`. `last_visit` und `here` bleiben ungefiltert. `cur` liefert `y.visit_limit` mit. `event_counts` kommt aus einem Lookup `select counts_visit from public.events where id = p_event`. Beides in `jsonb_build_object` aufnehmen.
- `drop function public.member_door(uuid, text, uuid, boolean)`, dann mit `p_override boolean default false` neu anlegen (Rumpf wie in `20261013200000_member_door_offline.sql`). Einfügen nach der Prüfung auf `already` und **vor** `if not p_admit`:
  ```sql
  if (v_info->>'visit_limit') is not null and (v_info->>'event_counts')::boolean and (v_info->>'visits')::int >= (v_info->>'visit_limit')::int and not p_override then
    return v_info || jsonb_build_object('result', 'limit');
  end if;
  ```
- `metadata` der Order: `jsonb_build_object('door', true, 'override', p_override)`.
- Neue `visits` in Rückgabe und Event-Payload: `(v_info->>'visits')::int + case when (v_info->>'event_counts')::boolean then 1 else 0 end`.
- Rechte wörtlich wie bei der alten Funktion (`20261013190000_member_checkin.sql:114`), jetzt mit fünf Argumenten: `revoke execute on function public.member_door(uuid, text, uuid, boolean, boolean) from public, anon;`. Supabase vergibt an neue Funktionen standardmäßig `anon`-Rechte, deshalb ist das Pflicht. `create or replace` von `member_door_rows` behält seine Rechte.

- [ ] **Step 4: Push + test**

Run: `npm run db:push && npm run db:types && npm run db:test`
Expected: `isolation: all checks passed`; `types.ts` enthält `counts_visit`, `visit_limit`, `p_override`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261118140000_visit_limit.sql supabase/tests/isolation.sql src/lib/supabase/types.ts
git commit -m "Door: count visits only at counting events, block at a type's visit limit (override)"
```

### Task 2: Gemeinsamer Tür-Helfer + Server-Aufrufe

**Files:**
- Modify: `src/members/door.ts`
- Modify: `src/members/members.test.mjs`
- Modify: `src/app/(app)/scan/actions.ts` (`admitMember`, `memberDoorCheckIn`, `syncCheckIns`)

**Interfaces:**
- Consumes: `member_door(..., p_override)` und die neuen Zeilenfelder aus Task 1
- Produces:
  - `MemberAtDoor.result` erweitert um `"limit"`; neue Felder `visit_limit?: number | null`, `event_counts?: boolean`
  - `export const visitLimitReached = (m: Pick<MemberAtDoor, "visits" | "visit_limit">): boolean`: `event_counts !== false && visit_limit != null && (visits ?? 0) >= visit_limit` (Typ: `Pick<MemberAtDoor, "visits" | "visit_limit" | "event_counts">`)
  - `export function localAdmit(m: MemberAtDoor, override: boolean, now: string): { member: MemberAtDoor; queue?: string }`: die Offline-Entscheidung der Tür (Spiegel von `member_door`)
  - `export function queuedMember(entry: string): { contactId: string; override: boolean } | null`: liest `member:<id>` / `member:<id>:override`; sonst `null` (Ticketcode)
  - `memberDoor(db, eventId, who, admit: boolean, override = false)`
  - `admitMember(eventId: string, contactId: string, override = false)`
  - Offline-Warteschlange: `member:<contact id>` bzw. `member:<contact id>:override`

- [ ] **Step 1: Write the failing test** (`members.test.mjs`, Import aus `./door.ts`)

```js
test("door offline: same rules as member_door", () => {
  const now = "2026-11-20T21:00:00Z"
  const m = { result: "member", contact_id: "c1", visits: 1, visit_limit: 2, event_counts: true }
  assert.equal(visitLimitReached({ visits: 9, visit_limit: null }), false)
  let r = localAdmit(m, false, now)
  assert.equal(r.member.result, "ok"); assert.equal(r.member.visits, 2); assert.equal(r.queue, "member:c1")
  r = localAdmit({ ...m, visits: 2 }, false, now)
  assert.equal(r.member.result, "limit"); assert.equal(r.queue, undefined)
  r = localAdmit({ ...m, visits: 2 }, true, now)
  assert.equal(r.member.result, "ok"); assert.equal(r.queue, "member:c1:override")
  r = localAdmit({ ...m, event_counts: false }, false, now)
  assert.equal(r.member.visits, 1) // non-counting event: let in, not counted
  r = localAdmit({ ...m, visits: 2, event_counts: false }, false, now)
  assert.equal(r.member.result, "ok") // limit reached but event doesn't count: stays open
  r = localAdmit({ ...m, visits: 2, checked_in_at: now }, false, now)
  assert.equal(r.member.result, "already") // already beats limit
  r = localAdmit({ ...m, visit_limit: null, visits: 50 }, false, now)
  assert.equal(r.member.result, "ok") // no limit, no block
  assert.deepEqual(queuedMember("member:c1:override"), { contactId: "c1", override: true })
  assert.deepEqual(queuedMember("member:c1"), { contactId: "c1", override: false })
  assert.equal(queuedMember("ABCDEFGHJK"), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL (Exporte fehlen).

- [ ] **Step 3: Implement**

- In `door.ts` die Helfer, die Typ-Felder und den `override`-Parameter ergänzen (an `p_override` durchreichen). `localAdmit` setzt bei `ok` den Wert `checked_in_at = now` und erhöht `visits` nur bei `event_counts`.
- `admitMember(eventId, contactId, override = false)` reicht `override` weiter.
- `memberDoorCheckIn` liest `fd.get("override") === "1"`.
- `syncCheckIns`: Statt `code.startsWith("member:")` und `code.slice(7)` wird `queuedMember(code)` verwendet, danach `admitMember(eventId, q.contactId, q.override)`. Bei `limit` landet der Name in `conflicts`, so wie heute bei jedem anderen Ergebnis außer `ok`.

- [ ] **Step 4: Run tests**

Run: `npm test && npx tsc --noEmit`
Expected: PASS, keine Typfehler (Aufrufer in `page.tsx` und `api/v1/members.ts` kompilieren weiter, weil `override` optional ist).

- [ ] **Step 5: Commit**

```bash
git add src/members/door.ts src/members/members.test.mjs "src/app/(app)/scan/actions.ts"
git commit -m "Door: visit limit helper, override through actions and offline sync"
```

### Task 3: Tür-UI – Karte, Scanner (online/offline), Mitglieder-Tab

**Files:**
- Modify: `src/app/(app)/scan/member-card.tsx`
- Modify: `src/app/(app)/scan/scanner.tsx` (`checkLocally`, `admitLocally`, `admit`, Button)
- Modify: `src/app/(app)/scan/page.tsx` (`Members`, Formular)
- Modify: `src/i18n/messages/de.json`, `en.json`

**Interfaces:**
- Consumes: `visitLimitReached`, `MemberAtDoor` (`limit`, `visit_limit`, `event_counts`), `admitMember(…, override)` aus Task 2

- [ ] **Step 1: Texte** (`door.member.*`, de / en)

| Key | de | en |
|---|---|---|
| `limit` | Besuchslimit erreicht | Visit limit reached |
| `limitHint` | Alle Besuche dieser Mitgliedsart sind aufgebraucht. | All visits of this membership type are used up. |
| `override` | Trotzdem einlassen | Let in anyway |
| `visitsOf` (one/other) | {count} von {limit} Besuchen genutzt | {count} of {limit} visits used |
| `notCounting` | Zählt nicht als Besuch | Doesn't count as a visit |

- [ ] **Step 2: `MemberCard`**

- `limit` gilt als Warnung (Rahmen `destructive`). Als Titel greift das vorhandene `t.dynamic(\`door.member.${m.result}\`)`, darunter `limitHint`.
- Mit `visit_limit` zeigt das Besuchs-Badge `visitsOf` statt `visits`, und zwar `destructive`, sobald `visitLimitReached(m)` gilt.
- Ist `event_counts === false`, kommt zusätzlich ein Badge `notCounting` (`outline`).
- `children` werden bei `member` **und** `limit` angezeigt. Die Aufrufer wählen den Button.

- [ ] **Step 3: Scanner**

- `checkLocally`: Das Ergebnis ist `checked_in_at ? "already" : visitLimitReached(m) ? "limit" : "member"`.
- `admitLocally(contactId, override = false)` ruft `localAdmit(m, override, new Date().toISOString())` auf. Ist `queue` gesetzt, wird die Person im Store aktualisiert und der Eintrag eingereiht.
- Listen-Refresh (Zeile 84): Statt `cur.queue.includes(\`member:${id}\`)` wird `cur.queue.some((e) => queuedMember(e)?.contactId === id)` geprüft, damit Override-Einlässe „drin“ bleiben.
- `admit(contactId, override = false)` reicht `override` an `admitMember` bzw. `admitLocally` weiter.
- Button: Bei `last.member.result === "limit"` heißt er `door.member.override` (variant `destructive`) und ruft `admit(id, true)` auf, sonst wie bisher.
- Vibration: `admit()` gibt bei `limit` schon das Fehlermuster aus. Beim ersten Scan (`submit`, ca. Zeile 146) kommt aber `result: "ok"` mit `member.result === "limit"`. Dort ebenfalls das Fehlermuster verwenden, wenn `r.member?.result === "limit"`.

- [ ] **Step 4: Mitglieder-Tab (`page.tsx`)**

Im Formular in `Members`: Bei `member.result === "limit"` kommen `<input type="hidden" name="override" value="1" />` und als Button-Text `door.member.override` dazu.

- [ ] **Step 5: Manuell prüfen (Domes-Testorg, nicht Coppi)**

Run: `npm run dev`. Dann in der Domes-Org: eine Mitgliedsart mit Limit 2 per SQL/API, ein Testmitglied, zwei zählende Events und ein nicht zählendes. Prüfen bei 375 px und 1280 px:
- Die Karte zeigt „0 von 2“, das nicht zählende Event „zählt nicht“.
- Beim dritten zählenden Event erscheint „Besuchslimit erreicht“; „Trotzdem einlassen“ lässt ein.
- Im Flugmodus (DevTools offline): Das Gerät zeigt `limit`, ein Override wird eingereiht und nach dem Wiederverbinden ohne Konflikt synchronisiert.
- Die Tür-Statistik zählt alle Check-ins mit.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/scan" src/i18n/messages/de.json src/i18n/messages/en.json
git commit -m "Door: show visits of limit, block at the limit with 'let in anyway', offline too"
```

### Task 4: Einstellen – Event-Formular, Mitgliedsarten, Key-API, Automationen

**Files:**
- Modify: `src/app/(app)/events/event-form.tsx`, `src/app/(app)/events/actions.ts` (`readEvent`)
- Modify: `src/app/(app)/members/types/page.tsx`, `src/app/(app)/members/actions.ts` (`saveType`)
- Modify: `src/api/v1/events.ts` (Antwort-Schema, Spaltenliste Zeile 44, Eingabe-Schema)
- Modify: `src/api/v1/members.ts` (`MembershipType`, `TYPE_COLS`, `TypeInput`, `typeRow`, Endpoint `/events/{id}/member-check-in`)
- Modify: `src/automations/objects.ts` (`event`, `membership_type`)
- Modify: `src/i18n/messages/de.json`, `en.json`

**Interfaces:**
- Consumes: Spalten aus Task 1, `memberDoor(…, override)` aus Task 2

- [ ] **Step 1: Texte**

| Key | de | en |
|---|---|---|
| `eventsPage.countsVisit` | Zählt als Besuch | Counts as a visit |
| `eventsPage.countsVisitHint` | Aus = Check-ins von Mitgliedern zählen nicht für Besuchslimits (z. B. Klubnacht). Sie zählen trotzdem als Besucher:innen. | Off = member check-ins don't count towards visit limits (e.g. club night). They still count as attendees. |
| `membership.visitLimit` | Besuchslimit | Visit limit |
| `membership.visitLimitHint` | Leer = unbegrenzt. Danach sperrt die Tür, außer man lässt bewusst trotzdem ein. | Empty = unlimited. After that the door blocks unless someone lets them in anyway. |

- [ ] **Step 2: Event-Formular + Action**

- Nur bei eingeschaltetem `members`-Modul (`ctx.modules.has("members")`): im `FormCard id="about"` nach der Kapazität ein Checkbox-Label (`accent-primary`, `name="counts_visit"`, `value="on"`, `defaultChecked={ev?.counts_visit ?? true}`) plus Hinweiszeile und `<input type="hidden" name="counts_visit_field" value="1" />`.
- In `readEvent`, nach dem Muster von `email_template`: `...(fd.has("counts_visit_field") && { counts_visit: fd.get("counts_visit") === "on" })`. Ohne Mitglieder-Modul bleibt der Wert dadurch unverändert.

- [ ] **Step 3: Mitgliedsarten**

- Im Formular ein Feld `<TypedInput kind="number" name="visit_limit" min={1} max={1000}>` mit Label und Hinweis, leer = `null`.
- In `saveType`: `visit_limit` aus dem Formularwert. Leer, ungültig oder `< 1` wird `null` (kein Limit), sonst eine ganze Zahl, höchstens 1000.
- Liste: In der bestehenden Zeile mit den Flags (Zeile 67–69) zusätzlich „max. N Besuche“ anzeigen. Die Bedingung in Zeile 67 wird `(x.prorate || x.fee_is_minimum || x.visit_limit)`, sonst erscheint die Zeile gar nicht. Dafür den Key `membership.visitLimitShort` = „max. {n} Besuche“ / „max. {n} visits“ anlegen.

- [ ] **Step 4: Key-API**

- `events.ts`: Antwort `counts_visit: z.boolean().describe("Member check-ins count towards membership visit limits (default true); off = still let in and counted as attendees")`, Spaltenliste ergänzen, Eingabe `counts_visit: z.boolean().optional()` analog zu `show_code_field`, auch beim Schreiben der Zeile.
- `members.ts`: `visit_limit: z.number().int().nullable().describe("Counting visits allowed per membership (null = unlimited); the door blocks after that unless overridden")`, in Antwort, `TYPE_COLS`, `TypeInput` (`.min(1).max(1000).nullable()`) und `typeRow`.
- Endpoint `member-check-in`:
  - Body bekommt `override: z.boolean().optional()`, an `memberDoor` weiterreichen.
  - Response-Enum bekommt `"limit"`, dazu `visit_limit`, `event_counts`.
  - `visits` bekommt die neue Beschreibung: „Counting check-ins in the current membership“.
  - In der Beschreibung `limit` und `override` erklären. Den Satz dazu nehmen: „Blocked people get no ticket; override is recorded on the order.“

- [ ] **Step 5: Automations-Katalog**

`event.fields` erhält `bool("counts_visit", true)` (schreibbar, damit z. B. eine Automation Samstage auf „aus“ stellen kann). `membership_type.fields` erhält `num("visit_limit")`. Der Editor zeigt die Labels aus `automations.fields.<object>.<key>` (`editor.tsx:69-70`), deshalb in de/en `automations.fields.event.counts_visit` („Zählt als Besuch“ / „Counts as a visit“) und `automations.fields.membership_type.visit_limit` („Besuchslimit“ / „Visit limit“) anlegen. Kein Test fängt fehlende Labels ab.

- [ ] **Step 6: Checks**

Run: `npm test && npm run lint && npm run build` (dev vorher stoppen)
Expected: alles grün; `objects.test.mjs` und der i18n-Check im Build sind dabei.

Manuell (Domes-Org): Häkchen „Zählt als Besuch“ aus und speichern, das Event bleibt aus. Limit an einer Mitgliedsart setzen und wieder leeren. `GET /api/v1/events/{id}` liefert `counts_visit`. In `/api/docs` stehen die neuen Felder.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/events" "src/app/(app)/members" src/api/v1/events.ts src/api/v1/members.ts src/automations/objects.ts src/i18n/messages
git commit -m "Events: 'counts as a visit' switch; membership types: visit limit (App, API, automations)"
```

## Im PR erwähnen

- `visits` bedeutet für **alle** Orgs ab sofort „zählende Besuche in der aktuellen Mitgliedschaft“. Die Benachrichtigung „Besuch {visits}“ (`membership.checked_in`) zeigt daher kleinere Zahlen, und bei nicht zählenden Events bleibt die Zahl stehen.
- Die Entscheidung im Chat ersetzt den Satz „erster Check-in zählt immer“ aus dem Issue.

## Nach dem Merge (kein Code, nicht Teil dieses Plans)

- Coppi: Die Mitgliedsart „Probe“ auf `visit_limit` stellen. Klubnächte und Samstage auf `counts_visit = false` setzen, jetzt und künftig. Danach die bisherige Probebesuch-Automation (#16) und das Custom Field abschalten, damit nicht zwei Zähler laufen. Das macht der Nutzer selbst oder es geschieht auf ausdrücklichen Auftrag. Kein Test in Coppi.
