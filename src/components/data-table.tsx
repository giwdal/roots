import { cn } from "@/lib/utils"
import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { withParams, type SearchParams } from "@/lib/url"

// `phone`: how the column shows in the phone list — "meta" (default: inline in the muted line under the title),
// "end" (right side of the row; default for right-aligned columns like amounts) or false (left out on phones).
// `table: false` = only in the phone list (a compact stand-in for wider table columns), not in the table from md.
export type Column<R> = { header: string; cell: (row: R) => React.ReactNode; className?: string; phone?: "meta" | "end" | false; table?: false }

const blank = (v: React.ReactNode) => v == null || v === false || v === "" || v === "–"

// Plain table; with `rowHref` the whole row is a link (usually "?edit=<id>" to open a drawer). `select` adds a
// checkbox per row (+ select all) that belongs to a <BulkBar form> on the page. `fixed` = the columns keep the widths
// from their className (`w-32`…; the rest share what's left), so several tables on one page (groups) line up.
export function DataTable<R>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  select,
  fixed,
}: {
  columns: Column<R>[]
  rows: R[]
  rowKey: (row: R) => string
  rowHref?: (row: R) => string | undefined
  empty: React.ReactNode // text, or an <EmptyState> (lists that have never had a row)
  select?: { form: string; label: string }
  fixed?: boolean
}) {
  const box = (row: R) =>
    select && <input type="checkbox" name="ids" value={rowKey(row)} form={select.form} aria-label={select.label} className="relative z-10 size-4 accent-primary" />
  const cols = columns.filter((c) => c.table !== false)
  if (!rows.length) return typeof empty !== "string" ? empty : <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <>
      {/* Phones: one grouped list like iOS — per row the title, one muted line with the other values (empty ones left
          out), an optional value on the right and a chevron when it opens something. No bulk selection on phones. */}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card md:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row)
          const [first, ...rest] = columns
          // Right-aligned columns (money, counts) go to the right side by default, the rest into the muted line.
          const place = (c: Column<R>) => c.phone ?? (c.className?.includes("text-right") ? "end" : "meta")
          const meta = rest.filter((c) => place(c) === "meta").map((c) => c.cell(row)).filter((v) => !blank(v))
          const end = rest.filter((c) => place(c) === "end").map((c) => c.cell(row)).filter((v) => !blank(v))
          return (
            <li key={rowKey(row)} className="relative flex min-h-14 items-center gap-3 px-4 py-2.5 text-sm active:bg-muted/60">
              <div className="grid min-w-0 flex-1 gap-0.5">
                <div className="min-w-0 truncate font-medium">
                  {href ? (
                    <Link href={href} scroll={false} className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none">
                      {first.cell(row)}
                    </Link>
                  ) : (
                    first.cell(row)
                  )}
                </div>
                {meta.length > 0 && (
                  <div className="flex min-w-0 items-center gap-x-2 overflow-hidden text-xs whitespace-nowrap text-muted-foreground [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
                    {meta.map((v, i) => (
                      <span key={i} className="inline-flex min-w-0 items-center truncate">
                        {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {end.length > 0 && <div className="flex shrink-0 flex-col items-end gap-1 text-right tabular-nums">{end.map((v, i) => <span key={i}>{v}</span>)}</div>}
              {href && <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </li>
          )
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table className={fixed ? "min-w-3xl table-fixed" : undefined}>
          <TableHeader>
            <TableRow>
              {select && (
                <TableHead className="w-10">
                  <input type="checkbox" data-bulk-all={select.form} aria-label={select.label} className="size-4 accent-primary" />
                </TableHead>
              )}
              {cols.map((c, i) => (
                <TableHead key={i} className={c.className}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = rowHref?.(row)
              return (
                <TableRow key={rowKey(row)} className={href ? "cursor-pointer has-checked:bg-muted/60" : "has-checked:bg-muted/60"}>
                  {select && <TableCell className="w-10">{box(row)}</TableCell>}
                  {/* The row link is stretched per cell: Safari ignores position:relative on <tr>, so one link stretched
                      over the row would cover the whole table (every click opened the last row). The first cell's link
                      is the real one (focus, screen readers); the others are mouse-only copies. Buttons in a cell (copy…) sit above
                      the link, so they do their own thing. */}
                  {cols.map((c, i) => (
                    <TableCell key={i} className={cn(c.className, href && "relative [&_button]:relative [&_button]:z-10")}>
                      {i === 0 && href ? (
                        <Link href={href} scroll={false} className="after:absolute after:inset-0 focus-visible:underline focus-visible:outline-none">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        <>
                          {href && <Link href={href} scroll={false} tabIndex={-1} aria-hidden className="absolute inset-0" />}
                          {c.cell(row)}
                        </>
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

// GET form: ?q=… (resets paging).
export function Pager({
  sp,
  page,
  hasNext,
  newer,
  older,
}: {
  sp: SearchParams
  page: number
  hasNext: boolean
  newer: string
  older: string
}) {
  if (page <= 1 && !hasNext) return null
  return (
    <div className="flex justify-between">
      {page > 1 ? (
        <Button
          render={<Link href={withParams(sp, { page: page - 1 === 1 ? undefined : String(page - 1) })} />}
          nativeButton={false}
          variant="outline"
          size="sm"
        >
          {newer}
        </Button>
      ) : (
        <span />
      )}
      {hasNext && (
        <Button render={<Link href={withParams(sp, { page: String(page + 1) })} />} nativeButton={false} variant="outline" size="sm">
          {older}
        </Button>
      )}
    </div>
  )
}

export const PAGE_SIZE = 50
// Range for a page, fetching one extra row to know whether there's a next page.
export const pageRange = (page: number) => [(page - 1) * PAGE_SIZE, page * PAGE_SIZE] as const

export { SearchBox } from "./search-box"

/**
 * A list's toolbar: the <SearchBox> and then filters / <Segments> / view switches. Phones: the search field with the
 * filters as icon buttons beside it, the view switch below (every view visible); nothing scrolls or gets cut off. From md: one wrapping row; give a view switch `className="ml-auto"` to put it on the right.
 */
export function ListToolbar({ search, children }: { search?: React.ReactNode; children?: React.ReactNode }) {
  // Phones: the search field with the filters as icon buttons beside it (one row), the view switch (<Segments>) as
  // its own full-width row below; without a search field the switch and the filter icons share one row.
  const seg = "[&>[data-slot=segments]]:min-w-0 [&>:has([data-slot=segments])]:min-w-0"
  const phoneWithSearch = "max-md:has-[[role=search]]:[&>[data-slot=segments]]:order-last max-md:has-[[role=search]]:[&>[data-slot=segments]]:basis-full max-md:has-[[role=search]]:[&>:has([data-slot=segments])]:order-last max-md:has-[[role=search]]:[&>:has([data-slot=segments])]:basis-full"
  const phoneNoSearch = "max-md:[&>[data-slot=segments]]:flex-1 max-md:[&>:has([data-slot=segments])]:flex-1"
  return (
    <div data-slot="list-toolbar" className={cn("relative flex min-w-0 flex-wrap items-center gap-2 md:gap-3", seg, phoneNoSearch, phoneWithSearch)}>
      {search && <div className="min-w-0 flex-1 md:max-w-xs md:flex-none md:basis-xs">{search}</div>}
      {children}
    </div>
  )
}
