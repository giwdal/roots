# UX backlog (user feedback, 18 Nov 2026)

Open tasks from the review of the first redesigned areas. `[ ]` open, `[x]` done (with commit). Area passes read this
file too; shared items are done once in shared components.

## A. One look for every control (shared components)
- [x] A1 (system.md, `--control` tokens in globals.css; button/input/select/combobox/segments/filter/export) One control height per context: toolbars and forms `h-9` (inputs, selects, filter triggers, segments,
      search, buttons), top bar `h-8` (⋯, primary, Sprout); phones `h-11` for form fields. Today input/select h-8,
      button sm h-7, filter trigger sm, segments min-h-7 → they don't line up.
- [x] A2 (system.md §Buttons) Button variants with fixed roles: primary (one per screen), outline (secondary), ghost (toolbar/icon),
      link (inline text links: `--link`, no underline, underline on hover), destructive (only in confirms/menus).
      Same font size (`text-sm`) and icon size (16 px) in every button.
- [x] A3 (system.md §Type) Type scale used everywhere: page/record title `text-xl font-semibold`, section heading `text-sm font-medium`,
      body `text-sm`, meta/labels `text-xs text-muted-foreground`, numbers `tabular-nums`. One font (Geist).
- [x] A4 (system.md §Icons) Icon sizes: 16 px in buttons/rows/menus, 20 px tab bar, AreaIcon 20 px tile; lucide only, stroke default.
- [x] A5 (`link` utility in globals.css, applied in App pages; public pages later) Contact data and inline links not underlined in bright white (contact page e-mail): `--link` colour or plain
      text with a small action icon.
- [x] A6 (image-form.tsx + picture-picker.tsx: tap the picture → upload at once, remove asks first; shop keeps its tile) Pictures: one `<PictureField>` (tap the picture / "+" tile → upload at once, ⋯ remove) replaces
      `<ImageForm>`'s native "Choose File · No file chosen · Hochladen" everywhere (event image, profile, logo, org).
- [x] A7 (ImageForm `labelHidden`, event image) No duplicate labels — keep checking in area passes:: a section with one field shows the section title only ("Bild / Bild").

## B. Record pages: layout, header, editing
- [x] B1 (patterns.md §8) Decide and document the record layout (research: Linear issue, Attio/HubSpot record, Stripe customer):
      desktop = main column (what happens: related lists, activity) + right rail (~320 px) with the properties;
      phones = identity header → key properties → main content. Single column only for simple records.
- [x] B2 (page.tsx: record pages always show title + badges in the page) Identity header on record pages: name + badges (+ avatar/area icon) together in the page; a lone badge pill
      above the content (contact page "Tickets") must not happen.
- [ ] B3 (component done: inline-field.tsx + patterns.md §8; areas still to adopt with patch actions) Inline editing of properties (click value → field, Enter/blur saves, Esc cancels, error toast + revert) in the
      right rail instead of a "Bearbeiten" sheet for single values; compound values (address, bank) open a small dialog;
      create flows stay forms. Needs per-field "patch" server actions that only update the given field.
- [ ] B4 Stat tiles: short values only (unit/period into the hint, no wrapping "30,00 € / Quartal").
- [ ] B5 Rows with actions on phones (dues card): one visible action at most, the rest in the row ⋯ or the row's
      sheet; no squeezed buttons, no truncated two-line meta.
- [ ] B6 Remove repetition: titles that repeat the top bar, descriptions that explain the obvious; self-explanatory,
      minimal, clear decisions for the user.

## C. Overlays on desktop
- [x] C1 (content-sheet.tsx: centred dialog from md, compact/normal/wide widths, darker backdrop) Desktop: forms/quick creates/confirms as a centred dialog (sizes: compact / default / wide), phones keep the
      bottom sheet — one component (`<ContentSheet>` responsive), so every `<UrlSheet>` follows.
- [ ] C2 Single values edited inline (B3) instead of opening any overlay.

## D. Data types, URLs, navigation
- [ ] D1 One display per data type across the App (dates, times, ranges, money, counts "12 / 200", durations,
      people, status, booleans, empty "–", links) — written in patterns.md §3, helpers where repeated.
- [ ] D2 URL rules written down and checked: `/<area>`, `/<area>/<id>`, `/<area>/<id>/<sub>`, `/<area>/new`,
      `/<area>/settings`; params `?edit ?new ?trash ?q ?page ?view` + filters. Fix outliers (`/rentals/r/[id]`,
      `/members/[id]` = membership vs contact, `/scan`).
- [x] D3 (topbar-crumbs.tsx: own nav stack in sessionStorage, back = history when it came from inside the App, else parent) Back navigation like a native app: the top bar back goes back in history when the person came from inside
      the App (member → contact → back = member), else to the parent; iOS edge-swipe works in standalone PWAs since
      iOS 12.2 (don't block it); keep the parent fallback for deep links.

## E. Complex components on phones
- [ ] E1 Calendar: list/day view on phones; week grid only from md.
- [ ] E2 Tables: cards on phones (done in DataTable); wide editors (positions, variants) as cards.
- [ ] E3 Boards/timelines: one column at a time with snap / own scroll box.
- [ ] E4 Research per component (calendar, table, board, timeline, picker) and note the chosen pattern in mobile.md.

## F. Settings structure
- [ ] F1 Separate personal settings (Profil, Benachrichtigungen, Sicherheit/Passkeys, KI-Assistent, Sprache, Darstellung)
      from org settings (Allgemein, Team, Rollen, Module, Bereiche, Felder, Orte, Integrationen, API) and area settings
      (gear) and platform admin (/admin); section nav grouped "Du" / "Organisation"; people only see what they may change.

## I. Installable app (PWA) — native feel on phones
Goal: on phones roots works like a native app from the home screen, on desktop like a perfect web app.
Today there is no manifest, no app icons, no service worker.
- [x] I1 (src/app/manifest.ts, /app-icon/[size] generated icons, appleWebApp + themeColor in layout; install hint still open) Web app manifest (`src/app/manifest.ts`: name, short_name, `display: standalone`, start_url `/`, theme and
      background colours for light/dark, icons 192/512 + maskable) and `apple-touch-icon`, iOS status bar style,
      splash colours; "Zum Home-Bildschirm" hint once for phone users in Safari.
- [x] I2 (public/sw.js: static cache + /offline page, production only) Service worker: app shell + static assets cached, offline page instead of the browser error, network-first
      for data (the door already keeps offline sales on the device).
- [ ] I3 Instant navigation: prefetch the tab bar targets and area pages, skeletons (loading.tsx) everywhere,
      View Transitions for push/pop between list and record (native-like slide), keep scroll position on back.
- [ ] I4 Native functions where they help: Web Push for notifications (iOS 16.4+ for home-screen apps; the inbox
      already exists → a push channel in `src/events/channels/`), app badge with the unread count
      (`navigator.setAppBadge`), Web Share for links/tickets/invoices, camera for scanning (exists) and photos of
      receipts, `tel:`/`mailto:`/maps links, file picker for documents, haptic-like feedback via pressed states.
- [ ] I5 Standalone details: safe areas (done), no rubber-band on the shell, pull-to-refresh on lists, edge-swipe
      back not blocked, links to other origins open in the browser.

## J. Search + Sprout on phones (quick access)
- [~] J1 (quick actions + Gehe zu + recents done; direct row actions like call/mail still open) Search as the phone's quick-access hub: recents + "Schnellaktionen" (Neuer Kontakt, Ticket scannen, Einchecken,
      Neue Bestellung, Zeit erfassen … — only modules that are on and permitted) shown before typing; results grouped by
      area with AreaIcon, records first, then pages, then actions; a result row can act directly where safe
      (call/mail a contact, open the scanner).
- [ ] J2 Sprout inside search: when Sprout is set up, the search field doubles as the prompt — "Frag Sprout: …" as the
      last row (Enter on no hit or ⌘↵ asks Sprout), the answer opens the Sprout sheet with the question; on phones
      Sprout is a full-height sheet (not a side panel) reachable from the search tab and the top bar.
- [ ] J3 Voice: dictation button in the search/Sprout field on phones (the comment form already dictates).
- [x] J4 (courses, automations, shift team, payments added; members by name; every group has its area colour) ⌘K sources for every record type (courses, shifts, HR, automations, cash book, payments missing).

## K. Start page & notifications
- [ ] K1 Start (home) per person: "Für dich" first — my next shift (with Einchecken), my tasks due, things waiting for me
      (approvals, new submissions, overdue dues/invoices I handle), today's events; then quick actions; tiles only for
      modules that are on. Research: Linear inbox/My issues, Notion home, Shopify home.
- [ ] K2 Notifications: one inbox (grouped by day, unread first, mark all read, filter by area with AreaIcon), every
      row opens the record (switching org visibly when it belongs to another org), settings per channel in the person's
      settings (F1); push + app badge on phones (I4).

## L. Comments & notes (one system)
Today: contacts have their own `contact_notes` (plain text "Verlauf"), projects/tasks use the generic `comments`
(entity + entity_id, attachments as files, dictation) with `<CommentForm>` + `<ActivityFeed>`.
- [ ] L1 One `<Comments entity entityId attachments photos dictation mentions?>` component (form + feed, same look
      everywhere: avatar, name, relative time, edit/delete own, attachments as thumbnails) built on `comments`.
- [ ] L2 Move contact notes into `comments` (migration copying `contact_notes` → `comments` with entity `contacts`,
      RLS check that the comment policy covers contacts), then contacts use L1; drop `contact_notes` later.
- [ ] L3 Offer it on every record with real content: contacts, members, events, shop orders, invoices, rentals,
      courses, HR people (switch per module via props, not copies).

## M. Performance (fast like a native app)
- [ ] M1 Measure: per area count DB round trips per request (target ≤ 2: context, then layout ∥ page), find
      sequential awaits and N+1 loops; every area has a `loading.tsx` skeleton that matches the page.
- [ ] M2 Caching: what can be cached per org (nav/module lists, settings, custom field defs, statuses) with
      `"use cache"` + tags invalidated by the actions; public pages already cached (`public-cache.ts`).
- [ ] M3 Client: prefetch tab bar + sidebar targets, keep JS small on phones (no heavy libs in the shell, dynamic
      import for editors/calendars/canvas), images via next/image sizes, fonts preloaded once.
- [ ] M4 Perceived speed: optimistic UI for toggles/inline edits/checklists, instant pressed states, skeletons
      instead of spinners, View Transitions between list and record.

## H. Code
- [ ] H1 Clean, generic code: shared pieces live once in `src/components/` / `src/lib/` (e.g. the status-badge maps,
      Section/RowGroup, picker search actions, inline-row editors) instead of near-copies per area; no repetition
      where one helper fits.
- [ ] H2 Modules work together and alone: every cross-module link, card, ⌘K source, filter and Start tile checks
      `ctx.modules` + permission; an org with 1 module gets a complete, clean App.

## G. Process
- [ ] G1 Look at the real UI regularly (headless browser screenshots at 375 / 1280, light + dark) and fix what shows.
- [ ] G3 Final review when everything is done: best user flows, clear information, works on phone and desktop,
      state-of-the-art UX/UI.
- [ ] G2 Re-check every redesigned area on phones (Events, Einlass, Shop, Finanzen, Kontakte, Mitglieder, E-Mails,
      Formulare, Gästelisten) against mobile.md §5.

## Z. To discuss tomorrow
- The manifest is global, so public org pages could also be "installed" as roots. Limit it to the App (only link it
  from the App layout), or give orgs their own manifest later?
- Inline editing needs one `patch<Entity>` server action per record type (validated per field) — fine to add to the
  key API too (`PATCH /<entity>/{id}` with one field), or keep it App-only?
- Record titles now show in the page *and* the top bar on desktop (crumb + big title, like Linear/Stripe). OK, or only
  in the top bar with badges next to it?
