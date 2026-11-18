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
