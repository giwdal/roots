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
