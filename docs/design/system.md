# roots — size, spacing & type system

Binding for every screen (App, admin). One system, adapted per device class. Tokens live in `src/app/globals.css`
(`--control`, `--control-sm`, `--text-*`) and `src/app/theme.css` (colours, radius); components read them, pages
don't hand-pick sizes.

## Device classes
| Class | Width | Layout |
|---|---|---|
| Phone | < 768 (`max-md`) | one column, tab bar + Menü, sheets from the bottom, touch sizes |
| Tablet | 768–1279 (`md`, `lg`) | sidebar (collapsible), one column records with properties on top; two columns only from `lg` when content is short |
| Desktop | ≥ 1280 (`xl`) | sidebar + content (+ Sprout panel); record pages main + right rail |

iPad in portrait is "tablet", in landscape "desktop-ish": test both 820 and 1180.

## Sizes
| Token | Phone | md+ | Used by |
|---|---|---|---|
| `--control` | 44 px | 36 px | inputs, selects, comboboxes, search, filter triggers, default buttons, segment rows |
| `--control-sm` | 36 px | 32 px | `size="sm"` buttons, top-bar buttons, icon buttons in rows, section nav |
| bar items | ≥ 44 px | – | tab bar, round primary button, sheet rows (`h-12`) |

Rule: everything in one row has the same height (a toolbar = search + filters + segments + buttons all `--control`).
Never hard-code `h-7/h-8/h-9` on a control; use the component sizes.

## Spacing (Tailwind scale, 4 px base)
| Where | Phone | md+ |
|---|---|---|
| Page gutter | 16 (`px-4`) | 24 (`md:px-6`), 32 from `lg` |
| Between page blocks (header, toolbar, list, sections) | 24 (`gap-6`) | 24–32 |
| Inside a section (heading → content, rows) | 12 (`gap-3`) | 12 |
| Form fields | 16 (`gap-4`); label → field 8 (`gap-2`) | same; two columns `sm:grid-cols-2` |
| Row / list item padding | 12 × 16 (`py-3 px-4`) | same |
| Card / tile padding | 12–16 | 16–20 |
| Sheet / dialog padding | 16 | 24 |

## Type (one family: Geist; Geist Mono for codes/numbers only when aligned)
| Role | Class |
|---|---|
| Page / record title | `text-xl font-semibold` (phone: in the top bar `text-base font-semibold`) |
| Section heading | `text-sm font-medium` (+ hint `text-xs text-muted-foreground`) |
| Body, table cells, buttons, inputs (md+) | `text-sm` (15 px, line-height 1.45) |
| Inputs on phones | 16 px (iOS zoom rule) |
| Labels in DetailList, meta, hints, badges | `text-xs` (13 px) |
| Numbers | `tabular-nums`; big numbers only in `<Stat>` (`text-lg font-medium`) |

Readability: prose max ~70 characters (`max-w-prose`), never all caps for more than a label, text contrast ≥ 4.5:1
(muted text included), line-height 1.45 for body.

## Contrast & surfaces (after Linear's UI redesign, https://linear.app/now/how-we-redesigned-the-linear-ui)
- Neutral chrome: greys only (`theme.css`), no tinted UI chrome; colour is for meaning (status, areas, links, focus).
- Text and neutral icons: darker in light mode, lighter in dark mode than "default" shadcn (foreground 0.17 / 0.96,
  muted 0.46 / 0.71 L in oklch), so content reads first.
- Surfaces as elevation steps, each a little lighter in dark mode (darker in light): background → card/panel →
  popover/dialog; never more than these three. Borders 1 px at low contrast.
- Light and dark come from the same rules (oklch lightness steps), so they stay in sync.
- From Linear's latest refresh (https://linear.app/now/behind-the-latest-design-refresh): "don't compete for attention
  you haven't earned" — the sidebar is dimmer than the content; "structure should be felt, not seen" — fewer
  separators, the remaining ones soft (`--border` low contrast), spacing does the grouping; neutrals are a slightly
  warm, low-chroma grey (chroma 0.004, hue 75), never blue-leaning; icons small (16 px), fewer of them.

## Our own rules, informed by Linear's *app* redesign posts (not their marketing site)
- **Kept on purpose:** the coloured area icons (`<AreaIcon>`) — unlike Linear's removed team colours, they are how
  people find a module at a glance (user decision, 19 Nov 2026).
- One accent, used scarcely: our primary is neutral; colour = `--link` / focus ring (blue) and status/area colours only.
- Surface ladder instead of shadows: background → card → popover/dialog, 1 px low-contrast hairlines; no drop
  shadows except floating layers.
- Radius: controls 8 px, cards/groups ~12 px, dialogs/sheets ~16 px, pills/badges full — one rule everywhere
  (`--radius: 0.5rem`, our choice for a calmer, denser look).
- Type: titles semibold with slight negative tracking (`tracking-tight`), body 400, buttons 500, captions 13 px;
  one family (Geist) from title to body.
- Pressed state on every button (1 px push).
- Full state cycle on every screen: skeleton (not spinner) while loading, empty state with the one action, inline
  error under the field, toast only for transient results.
- **One verb per action, everywhere**: "In den Papierkorb" = soft delete of a record (restorable), "Löschen" =
  gone for good (rows, settings), "Entfernen" = take something out of a list/link without deleting it (a guest, a
  link, a picture), "Stornieren" = money/booking reversed, "Abmelden" = a person leaves a course/list. Never
  synonyms for the same action.
- The landing-page "taste" rules (no em-dashes, eyebrow limits, hero rules) apply to the public/marketing pages
  when they get their pass, not to the App.

## Radius, borders, elevation
Controls `rounded-lg`, cards/tiles/groups `rounded-xl`, sheets/dialogs `rounded-2xl`, badges/pills `rounded-full`.
1 px `border-border` for separation; shadows only on floating things (menus, sheets, tab bar).

## Icons
Lucide only. 16 px in buttons, rows, menus, badges (12 px); 20 px in the tab bar and Menü rows; `<AreaIcon>` 20 px tile
(32 in the phone Menü). Icon-only buttons get a tooltip (desktop) and an `aria-label`.

## Buttons
| Variant | Use |
|---|---|
| `default` (primary) | the one main action of a screen/sheet |
| `outline` | visible secondary actions (≤ 2) |
| `ghost` | toolbar/icon buttons, row actions |
| `link` / `<AddLink>` | inline text actions ("+ Hinzufügen", "Alle anzeigen") in `--link`, no underline until hover |
| `destructive` | only inside confirmations and menus (red item) |
All buttons `text-sm font-medium`, icon 16 px, height from the size tokens.

## Forms: where inputs go, how wide, how structured (binding)

**Structure**
- A form is a stack of sections (`<FormCard>` / `<Section>` with a short noun title: "Preis", "Versand", "Adresse"),
  ordered by how often people need them: what defines the thing first, rare settings last behind "Mehr Angaben".
- Inside a section: label above the field, `gap-4` between fields, `gap-2` label → field. Related short fields share a
  row (`grid gap-4 sm:grid-cols-2` or a fixed-width row: PLZ + Ort, Start + Ende, Betrag + MwSt.); long fields span the row.
- One question per row: a checkbox/switch row is "label left, control right" in settings (patterns.md §2) and
  "checkbox + label" in forms; its dependent fields appear indented right below it only when it is on.
- Hints: at most one short line under a field (`text-xs text-muted-foreground`), only when needed to fill it in
  correctly. Everything else (what happens if …, legal background, examples) goes into `<InfoTip>` next to the label.
- Labels are short nouns ("Vorschlag", not "Vorschlag (vorausgefüllt, optional)"); optional fields say "(optional)"
  only when most fields in the form are required.

**Widths (by kind, not by available space)** — fields don't stretch to 1600 px:
| Kind | Width |
|---|---|
| Name, title, subject, email, URL, address line | full row of its column, max `max-w-xl` |
| Long text (description, note) | full row, `max-w-2xl` |
| Money, number, quantity, percentage | `w-40` (right-aligned value) |
| Date | `w-44`; date + time side by side (`w-44` + `w-28`) |
| Time | `w-28` |
| PLZ | `w-28`; Ort fills the rest of that row |
| IBAN | `max-w-md`; BIC `w-40` |
| Phone | `max-w-xs` |
| Choice (segments) | as wide as its options; select ≤ 15 options `max-w-xs` |
| Pickers (RecordPicker, tags) | `max-w-xl` |

`<TypedInput kind>` sets these widths itself for its kinds; plain `<Input>` gets the class from this table.

**Which control** — patterns.md §4 (segments ≤ 5, select ≤ 15, search picker beyond; switch when it takes effect at
once, checkbox inside a form that is saved; DateInput/TimeInput, never native date/time).
