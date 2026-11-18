# Performance review — signed-in App

Scope: `src/app/(app)/**`, `src/app/(app)/layout.tsx`, `src/components/app-shell.tsx`, `src/lib/context.ts`,
`src/lib/supabase/*`. Static reading only (no build, no profiler); numbers are round trips (RT ≈ 70 ms each to the DB).

## Summary

- **The request path is mostly well built**: `getContext()` is one parallel RT (claims are verified locally), layout and
  page run concurrently, most pages fetch in one `Promise.all`. `shop/orders/[id]` is the model: one embedded select.
- **Every request pays the context RT first** (`is_platform_admin` ∥ `org_members…`), and so does every Server Action.
  That data changes rarely and is the single best cache target.
- **A few record pages are deep waterfalls**: project overview ≈ 6–7 sequential RTs, contact page 5, rentals 4, shop
  product 3–4, invoice / membership / members list 2. Most follow-ups only exist because `profiles` cannot be embedded
  (no FK from `org_members.user_id` / `*.created_by` to `profiles`) or because a known id is fetched in a second round.
- **Aggregates in JS over capped row sets**: `max_rows = 1000` (`supabase/config.toml:18`, hosted default is the same),
  but pages ask for `.limit(5000)` / no limit and sum in JS. Slow *and* silently wrong past 1000 rows (event revenue,
  overdue dues, "paid until", task progress).
- **Client payload**: `de.json` (295 KB) is passed as a prop to `<I18nProvider>` on every hard load, and client
  components import `@/i18n/config`, which statically imports *both* JSON files (≈ 567 KB raw) into the client graph.
  Sprout's chat (AI SDK, react-markdown, remark-gfm) is bundled into the shell for every page although the panel is
  usually closed.
- **Navigation feel**: 10 areas have no `loading.tsx` (contacts, events, events/[eventId] tabs, invoices, payments,
  settings, shifts, guestlists, notifications, scan). Under a persisted area layout a click there shows nothing until
  the server is done (the root `<Suspense>` and `(app)/loading.tsx` sit above the shared layout and don't trigger).

## Round trips per page (after the proxy)

| Page | Sequential RTs | Where |
|---|---|---|
| Layout + `getContext()` | 1 (+1 for a platform admin inside a foreign org) | `src/lib/context.ts:38-46`, `:62-68`; layout queries run ∥ page (`layout.tsx:14`) |
| Home `/` | ctx + 2 | `page.tsx:41` `my_staff_id` → `shift_assignments`; `:55` sums up to 5000 dues in JS |
| `contacts/[id]` | ctx + 4 | `:72` (14 queries) → `:112` (7) → `:127` profiles → `Timeline` `:594` profiles |
| `projects/[id]` (overview) | ctx + 6 | `projectBasics` 2 (`src/projects/load.ts:8`, `:15`) → `linkedRecords` `:59` → `ActivityFeed` 3 (`src/components/activity-feed.tsx:53`, `:64`, `:79`) |
| `rentals/[id]` | ctx + 3 | `:37` → `:51` → `:59` |
| `shop/[id]` | ctx + 2–3 | `:51` → N× `shop_left` RPC (`:70`, one HTTP call per variant, admin client) → `stockItem` `:81` |
| `cashbook` | ctx + 3 | `:61` accounts → `:65` → `:85` |
| `invoices/[id]` | ctx + 2 | `:37` → `:48` source doc + contact (both embeddable) |
| `members/[id]` | ctx + 2 | `:428` → `MembershipBody` `:40` (dues only need the id from the URL) |
| `members` list | ctx + 2 | `:54` → `:65` (other periods + fees) |
| `events` list | ctx + 2, **N+1** | `:57` → one `count: exact` request per row (`:63-66`) |
| `events/[eventId]` | ctx + 1 | layout `:23` ∥ page `:34`, but the event row is fetched twice and all sold tickets are pulled (`:36`, no limit) |
| `events/[eventId]/tickets` | ctx + 2 | `:64` (all tickets, no limit) → `:459` |
| `scan` | ctx + 2 (+ panels) | `:35` events → `:45` `doorStats` |
| `shop/orders/[id]` | ctx + 1 | one embedded select — the pattern to copy |

## Ranked fixes

Impact: H/M/L. Effort: S (< 1 h), M (half a day), L (more). Quick wins first within the ranking where impact is equal.

### 1. Make `profiles` embeddable — H / S
Add FKs so PostgREST can join profiles: `org_members.user_id → profiles(id)` (and optionally `comments.created_by`,
`contact_notes.created_by`, `task_assignees.user_id`). Then replace the follow-up lookups with embeds:
`org_members.select("user_id, profiles(id, full_name, email)")` in `src/projects/load.ts:9/15`,
`contacts/[id]/page.tsx:113/127`, `src/components/activity-feed.tsx:80` (comments), `contacts/[id]/page.tsx:594`.
Removes one RT from project pages, task drawer, contact page, home (`?task=`), tasks views. Migration + `db:types`.

### 2. Cache the context data per user — H / M
`getContext()` (`src/lib/context.ts:38-46`) runs on every page render, every Server Action and every `/files/<id>`
hit. Move memberships + org + modules + role + `is_platform_admin` into a `"use cache"` function keyed by the verified
`userId` (from `getClaims()`, which stays uncached), reading with the secret-key client filtered by `user_id`,
`cacheTag("user:<id>")` + `cacheTag("org:<orgId>")` per org, `cacheLife("minutes")` as safety net. Invalidate with
`updateTag` in: team invite accept / role change / remove (`settings/team/actions.ts`), org name/logo
(`settings/general/actions.ts`), module toggles and role definitions in `/admin` (tag `roles` for all), org delete.
RLS stays the real check, so a stale minute only affects what the UI shows. Saves ~70 ms on **every** request and
action. Keep `createClient(org.id)` and the cookie read outside the cached function.

### 3. Stop aggregating capped row sets in JS — H (correctness too) / M
One small SQL function (or a view with `count`/`sum`) per number, called in the existing `Promise.all`:
- `events/[eventId]/page.tsx:36` sold/revenue/checked-in → `event_ticket_stats(event)`; same for `tickets/page.tsx:69`.
- `page.tsx:55` overdue dues → `sum`/`count` (also `members/dues/page.tsx:60`).
- `members/page.tsx:68` fees for "paid until" (50 memberships × periods can pass 1000).
- `projects/page.tsx:48` and `projects/[id]/page.tsx:49` progress → `count(*) filter (where completed_at …)` per project.
- `forms/page.tsx:43` new submissions per form → grouped count.
- `src/projects/load.ts:11` used tags (up to 2000 arrays) → `distinct unnest(tags)` RPC like `contact_tags`.

### 4. Events list N+1 → one query — H / S
`events/page.tsx:63-66` fires one `count: exact` request per row (up to the page size, every list load). Use an
embedded aggregate in the list select (`tickets(count)` with `.in("tickets.status", ["valid","used"])`) or the RPC
from #3 with `p_ids uuid[]`. Same idea for `shop/[id]/page.tsx:70`: one `shop_left_many(ids, stocks)` call instead of
one RPC per variant.

### 5. Split the i18n messages out of the client graph — H / S
- `src/i18n/client.tsx:6`, `src/components/app-sidebar.tsx`, `src/components/mobile-menu.tsx`, `src/app/global-error.tsx`
  import `@/i18n/config`, which imports `de.json` + `en.json`. Move `locales`, `localeNames`, `isLocale`, `Locale`,
  `defaultLocale` into `src/i18n/locales.ts` (no JSON) and import that from client code; keep `messages` server-only.
  Verify with the build's client chunk sizes before/after.
- `src/app/layout.tsx:59` serialises the whole message tree into every hard load's HTML/RSC payload. Either pass only
  the namespaces client components use (`common`, `shell`, `sprout`, … — a list next to the provider), or load the
  messages in the client from a static per-locale chunk (`import(\`./messages/${locale}.json\`)` in a client module,
  cached by the browser across loads). The first is simpler and keeps hydration synchronous.

### 6. `loading.tsx` for the areas that have none — H / S
Add `export { PageSkeleton as default }`-style files (or a record-shaped skeleton) to: `contacts/`, `events/`,
`events/[eventId]/` (tab switches keep the event header and show a body skeleton), `invoices/`, `payments/`,
`settings/` (keeps the section nav), `shifts/`, `guestlists/`, `notifications/`, `scan/`. With Partial Prefetching on
(`next.config.ts`) these fallbacks are part of the prefetched App Shell, so clicks react at once. Also add a
record-shaped `PageSkeleton` variant (header + two columns) for `[id]` routes; the list skeleton looks wrong there.

### 7. Project page: parallelise and stream — H / M
`projects/[id]/page.tsx`: start `linkedRecords` from the links promise inside the first `Promise.all`
(`links.then(l => linkedRecords(...))`) instead of `:59`; wrap `<ActivityFeed>` (`:146`) in `<Suspense>` with a small
skeleton so header, progress and details paint after ~2 RTs. In `activity-feed.tsx:62-65` fetch task comments in the
first round via an RPC `project_comments(p_id)` (or `comments … entity_id in (select id from tasks where project_id)`)
instead of waiting for task ids. Same `<Suspense>` for `TaskDrawer`'s feed and the contact page's `<Timeline>`.

### 8. Contact page: collapse rounds — H / M
`contacts/[id]/page.tsx`: everything in round B (`:112`) depends only on `c.email` / `c.user_id`. Options: (a) fetch
the contact alone first (round A' tiny) and run A + B together, or (b) move B's email-keyed lookups into the
sections that use them and wrap those in `<Suspense>` (payments, mails, guest lists are lower on the page). With #1,
`:127` disappears. Target: ctx + 2 with the header streaming after the first.

### 9. Embed instead of a second round — M / S
- `invoices/[id]/page.tsx:48`: embed `source:documents!source_id(id, kind, status, number)` and
  `contacts(id, first_name, last_name, company, email)` into the `:38` select (RLS still hides the contact without
  `crm.view`; keep the UI check).
- `members/[id]/page.tsx:40`: dues only need `id` from the URL → move into the `:428` `Promise.all`; `others` →
  `contacts(…, memberships(…))` embed.
- `members/page.tsx:65`: embed `contacts(memberships(…))` and `member_dues(...)` (filtered `kind=fee`) into `:54`.
- `page.tsx:41` (home shifts): `shift_assignments.select("…, staff!inner(user_id)").eq("staff.user_id", ctx.userId)`
  instead of `my_staff_id` first.
- `rentals/[id]/page.tsx:51/59`, `cashbook/page.tsx:61/85`: same pattern (embed children's rentals / receipts).
- `events/[eventId]` layout + page both select the event (`layout.tsx:23`, `page.tsx:35`): one `cache()`-wrapped
  `getEvent(id)` with the union of columns (DB load only; latency is already parallel).

### 10. Lazy-load Sprout's chat and the ⌘K dialog — M / S
`src/components/sprout/panel.tsx:13` imports `ChatView` (→ `@ai-sdk/react`, `ai`, `react-markdown`, `remark-gfm`,
file upload) statically, and `<SproutPanel>` is in every App page (`app-shell.tsx:71`). Load `ChatView` with
`next/dynamic` (`ssr: false`) when `open` first becomes true; warm it on hover of `SproutButton`. Same for the
`CommandDialog` content in `command-search.tsx` (cmdk + search UI) — keep the trigger, load the palette on first ⌘K.

### 11. `/files/<id>` thumbnails — M / S
`src/app/(app)/files/[id]/route.ts`: each image tile = ctx RT + row RT + sign RT, then a redirect that is never
cached (`activity-feed.tsx:265`, `file-list.tsx:40`). For lists, sign in bulk while rendering
(`storage.from("files").createSignedUrls(paths, 3600)`) and use those URLs for thumbnails; for the route, add
`Cache-Control: private, max-age=50` to the redirect so re-renders and back navigation don't re-run it. #2 removes the
context RT here as well.

### 12. Cache rarely changing per-org config — M / M
Only worth it where the query sits *alone* in a round (otherwise it's hidden by the parallel round). Candidates, each
via `"use cache"` + secret-key client filtered by `orgId` + `cacheTag("org:<id>:<thing>")`, permission checked by the
caller with `ctx.can()` first:
- custom field definitions `loadFields()` (`src/lib/custom-fields.ts:97`, 35 call sites; invalidate in Settings → Felder actions),
- `task_statuses` (project/task columns), `membership_types`, `org_billing` (invoice settings), `positions`/`locations`,
  `contact_tags` (invalidate on contact tag writes — or skip: it's live-ish data),
- nav/quick actions are already pure (computed from modules + role) and get cached by #2.
Must stay uncached: anything with money/status/stock (orders, payments, dues, tickets, stock), notifications/unread,
door/scan, shift check-in, availability, Sprout chats, anything read through RLS that differs per person beyond org +
permission (HR private data, files of `employees`).

### 13. Double renders after client mutations — M / S
Actions that already `revalidatePath(...)` (projects, events, rentals, settings) are followed by `router.refresh()` in
the caller (`components/inline-field.tsx:62`, `projects/inline-title.tsx:25`, `projects/autosave-form.tsx:29`,
`projects/link-picker.tsx:50`, `components/timeline-bar.tsx:84/167`, `calendar-view.tsx:158`, `wiki/tree-nav.tsx:37`).
A Server Action that revalidates already returns the fresh RSC payload; the extra `refresh()` renders the whole page
(all its queries) a second time. Remove the refresh where the action revalidates, or the revalidate where the client
refreshes. Also narrow `revalidatePath("/", "layout")` (`settings/general/actions.ts:18/36`, `settings/ai-actions.ts`,
`notifications/actions.ts:10`) — it re-renders the App layout (context + 4 queries) and drops the 30 s client cache for
every page; `notifications` only needs the unread badge (layout) and `/notifications`.

### 14. Layout: let the shell paint before the badge — L / S
`(app)/layout.tsx:14` waits for unread count, profile, member contact and (admins) up to 500 orgs before the sidebar
renders on hard loads. Fold profile + member contact into the cached context (#2); the unread count could stream in
its own `<Suspense>` in the sidebar/mobile bar. The admins' org list (`:20`) can load on opening the switcher (server
action) instead of every request.

### 15. Date picker calendar on demand — L / S
`src/components/date-input.tsx:5-6` pulls `react-day-picker` + both locales into every form (31 importers) though the
calendar only shows in the popover. `next/dynamic` the `<Calendar>` inside `PopoverContent`.

### 16. Images — L / S
Avatars, logos and shop thumbnails load the original upload (up to 2 MB) for 32–48 px slots (`components/picture.tsx`,
`shop/page.tsx:148`, `shop/[id]/page.tsx:228`). Use Supabase image transforms (`/render/image/public/…?width=96`) in
`imageUrl()` with a size argument for thumbnails, or resize on upload (`replaceImage`). Fonts are fine (`next/font`
Geist, variable, self-hosted).

### 17. Prefetching — L / S
Partial Prefetching is on and `<Link>`s prefetch the App Shell by default; leave sidebar/tab-bar links at the default
(`prefetch={true}` would run every visible area's full dynamic render, i.e. all its queries, on each page view). The
gain comes from #6 (fallbacks in the shell) and #2 (shorter dynamic part). `staleTimes.dynamic: 30` is a good setting.
The only full reload is the SaveBar's "discard" (`save-bar.tsx:129`, `window.location.reload()`); a form `reset()` +
`router.refresh()` would keep the shell and Sprout.

## Not problems
- `getClaims()` verifies the JWT locally (no auth RT); the proxy does the same.
- Heavy editors are route-scoped: xyflow only in `automations/[id]/editor.tsx`, recharts only in reports, Tiptap only
  in forms that edit rich text, `Markdown` in tasks renders on the server.
- Area layouts don't query beyond `requirePerm()` (cached per request).
