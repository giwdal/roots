# UX backlog (user feedback, 18 Nov 2026)

Open tasks from the review of the first redesigned areas. `[ ]` open, `[x]` done (with commit). Area passes read this
file too; shared items are done once in shared components.

## A. One look for every control (shared components)
- [ ] A1 One control height per context: toolbars and forms `h-9` (inputs, selects, filter triggers, segments,
      search, buttons), top bar `h-8` (⋯, primary, Sprout); phones `h-11` for form fields. Today input/select h-8,
      button sm h-7, filter trigger sm, segments min-h-7 → they don't line up.
- [ ] A2 Button variants with fixed roles: primary (one per screen), outline (secondary), ghost (toolbar/icon),
      link (inline text links: `--link`, no underline, underline on hover), destructive (only in confirms/menus).
      Same font size (`text-sm`) and icon size (16 px) in every button.
- [ ] A3 Type scale used everywhere: page/record title `text-xl font-semibold`, section heading `text-sm font-medium`,
      body `text-sm`, meta/labels `text-xs text-muted-foreground`, numbers `tabular-nums`. One font (Geist).
- [ ] A4 Icon sizes: 16 px in buttons/rows/menus, 20 px tab bar, AreaIcon 20 px tile; lucide only, stroke default.
- [ ] A5 Contact data and inline links not underlined in bright white (contact page e-mail): `--link` colour or plain
      text with a small action icon.
- [ ] A6 Pictures: one `<PictureField>` (tap the picture / "+" tile → upload at once, ⋯ remove) replaces
      `<ImageForm>`'s native "Choose File · No file chosen · Hochladen" everywhere (event image, profile, logo, org).
- [ ] A7 No duplicate labels: a section with one field shows the section title only ("Bild / Bild").

## B. Record pages: layout, header, editing
- [ ] B1 Decide and document the record layout (research: Linear issue, Attio/HubSpot record, Stripe customer):
      desktop = main column (what happens: related lists, activity) + right rail (~320 px) with the properties;
      phones = identity header → key properties → main content. Single column only for simple records.
- [ ] B2 Identity header on record pages: name + badges (+ avatar/area icon) together in the page; a lone badge pill
      above the content (contact page "Tickets") must not happen.
- [ ] B3 Inline editing of properties (click value → field, Enter/blur saves, Esc cancels, error toast + revert) in the
      right rail instead of a "Bearbeiten" sheet for single values; compound values (address, bank) open a small dialog;
      create flows stay forms. Needs per-field "patch" server actions that only update the given field.
- [ ] B4 Stat tiles: short values only (unit/period into the hint, no wrapping "30,00 € / Quartal").
- [ ] B5 Rows with actions on phones (dues card): one visible action at most, the rest in the row ⋯ or the row's
      sheet; no squeezed buttons, no truncated two-line meta.
- [ ] B6 Remove repetition: titles that repeat the top bar, descriptions that explain the obvious; self-explanatory,
      minimal, clear decisions for the user.

## C. Overlays on desktop
- [ ] C1 Desktop: forms/quick creates/confirms as a centred dialog (sizes: compact / default / wide), phones keep the
      bottom sheet — one component (`<ContentSheet>` responsive), so every `<UrlSheet>` follows.
- [ ] C2 Single values edited inline (B3) instead of opening any overlay.

## D. Data types, URLs, navigation
- [ ] D1 One display per data type across the App (dates, times, ranges, money, counts "12 / 200", durations,
      people, status, booleans, empty "–", links) — written in patterns.md §3, helpers where repeated.
- [ ] D2 URL rules written down and checked: `/<area>`, `/<area>/<id>`, `/<area>/<id>/<sub>`, `/<area>/new`,
      `/<area>/settings`; params `?edit ?new ?trash ?q ?page ?view` + filters. Fix outliers (`/rentals/r/[id]`,
      `/members/[id]` = membership vs contact, `/scan`).
- [ ] D3 Back navigation like a native app: the top bar back goes back in history when the person came from inside
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

## G. Process
- [ ] G1 Look at the real UI regularly (headless browser screenshots at 375 / 1280, light + dark) and fix what shows.
- [ ] G2 Re-check every redesigned area on phones (Events, Einlass, Shop, Finanzen, Kontakte, Mitglieder, E-Mails,
      Formulare, Gästelisten) against mobile.md §5.
