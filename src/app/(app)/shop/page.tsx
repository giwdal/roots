import Link from "next/link"
import { redirect } from "next/navigation"
import { ExternalLinkIcon, PlusIcon, ShoppingBagIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink } from "@/components/actions-menu"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { FilterMenu } from "@/components/filter-menu"
import { Notice } from "@/components/notice"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { imageUrl } from "@/lib/images"
import { pageParam, param, siteUrl, withParams, type SearchParams } from "@/lib/url"
import { cn } from "@/lib/utils"
import { PRODUCT_STATUSES } from "@/shop/fields"
import { stockList } from "@/shop/stock"
import { ProductBadge } from "./badges"
import { StockSheet } from "./stock-sheet"

type Ctx = Awaited<ReturnType<typeof requirePerm>>

// Produkte: what's for sale and how it sells; the "Bestand" segment (?view=stock) is the stock per physical item with
// its booking sheet (?edit=<item id>). The trash is ?trash=1.
export default async function ProductsPage({ searchParams }: PageProps<"/shop">) {
  const sp = await searchParams
  if (param(sp, "status") === "trash") redirect("/shop?trash=1")
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const canManage = ctx.can("shop.manage")
  const trash = canManage && param(sp, "trash") === "1"
  const stock = !trash && param(sp, "view") === "stock"
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const views = [
    { href: `/shop${withParams(sp, { view: undefined, edit: undefined, page: undefined, status: undefined })}`, label: t("store.products"), current: !stock },
    { href: `/shop${withParams(sp, { view: "stock", page: undefined, status: undefined })}`, label: t("store.lager.title"), current: stock },
  ]

  return (
    <Page>
      <PageHeader
        area="shop"
        title={trash ? `${t("store.products")} · ${t("store.trash")}` : stock ? t("store.lager.title") : t("store.products")}
        settings={canManage && { href: "/shop/settings", label: t("common.settings") }}
        actions={
          <Button render={<a href={siteUrl(ctx.org.slug, "/shop", ctx.org.site_domain)} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
            <ExternalLinkIcon /> <span className="max-md:sr-only">{t("store.openShop")}</span>
          </Button>
        }
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/shop" : "/shop?trash=1"} icon={trash ? <ShoppingBagIcon /> : <Trash2Icon />}>
                {trash ? t("store.backToList") : t("store.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: "/shop/new", label: t("store.newProduct") } : undefined}
      />
      <Notice error={stock && param(sp, "edit") ? undefined : param(sp, "error")} ok={param(sp, "ok")} />
      {stock ? <StockView ctx={ctx} t={t} sp={sp} q={q} views={views} /> : <ProductList ctx={ctx} t={t} sp={sp} q={q} trash={trash} views={views} canManage={canManage} />}
    </Page>
  )
}

async function ProductList({ ctx, t, sp, q, trash, views, canManage }: { ctx: Ctx; t: T; sp: SearchParams; q?: string; trash: boolean; views: { href: string; label: string; current: boolean }[]; canManage: boolean }) {
  const page = pageParam(sp)
  const status = PRODUCT_STATUSES.find((s) => s === param(sp, "status"))
  let query = ctx.supabase
    .from("products")
    .select("id, name, slug, status, kind, price_cents, stock, category, images, product_variants(stock, active)")
    .eq("org_id", ctx.org.id)
    .order("position")
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  // Archived products only show when asked for; the list is what's for sale or being prepared.
  if (!trash) query = status ? query.eq("status", status) : query.neq("status", "archived")
  if (q) query = query.or(`name.ilike.%${q}%,category.ilike.%${q}%`)
  const { data } = await query
  const rows = (data ?? []).slice(0, PAGE_SIZE)
  // Sold so far per product: paid orders, refunded pieces taken off (pieces + revenue).
  const { data: sales } = rows.length
    ? await ctx.supabase
        .from("pay_order_items")
        .select("quantity, refunded_quantity, unit_amount, metadata, pay_orders!inner(status, source_module)")
        .eq("org_id", ctx.org.id)
        .eq("pay_orders.source_module", "shop")
        .in("pay_orders.status", ["paid", "partially_refunded"])
        .in("metadata->>product_id", rows.map((p) => p.id))
    : { data: [] }
  const sold = new Map<string, { pieces: number; cents: number }>()
  for (const i of sales ?? []) {
    const id = String((i.metadata as Record<string, unknown>)?.product_id)
    const n = i.quantity - i.refunded_quantity
    const cur = sold.get(id) ?? { pieces: 0, cents: 0 }
    sold.set(id, { pieces: cur.pieces + n, cents: cur.cents + n * i.unit_amount })
  }
  const stock = (p: (typeof rows)[number]) => {
    if (p.kind === "digital") return <span className="text-muted-foreground">–</span>
    const list = p.product_variants.filter((v) => v.active)
    const values = list.length ? list.map((v) => v.stock) : [p.stock]
    return values.some((v) => v === null) ? <span className="text-muted-foreground">{t("store.unlimited")}</span> : String(values.reduce((s, v) => s! + v!, 0))
  }
  const filtered = !!(q || trash || status)

  return (
    <>
      <ListToolbar search={<SearchBox q={q} label={t("store.search")} keep={trash ? { trash: "1" } : status ? { status } : undefined} />}>
        {!trash && <FilterMenu param="status" label={t("store.status")} options={PRODUCT_STATUSES.map((s) => ({ value: s, label: t.dynamic(`store.statuses.${s}`) }))} />}
        {!trash && <Segments label={t("store.products")} items={views} className="md:ml-auto" />}
      </ListToolbar>
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        rowHref={(p) => `/shop/${p.id}`}
        empty={
          trash ? (
            t("store.trashEmpty")
          ) : filtered ? (
            t("store.noMatch")
          ) : (
            <EmptyState
              area="shop"
              title={t("store.emptyTitle")}
              text={t("store.emptyText")}
              action={
                canManage && (
                  <Button render={<Link href="/shop/new" />} nativeButton={false} size="sm" variant="outline">
                    <PlusIcon /> {t("store.newProduct")}
                  </Button>
                )
              }
            />
          )
        }
        columns={[
          {
            header: t("store.product"),
            cell: (p) => (
              <span className="flex items-center gap-3">
                <span className="size-10 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {p.images[0] && (
                    // eslint-disable-next-line @next/next/no-img-element -- public bucket URL
                    <img src={imageUrl(p.images[0])} alt="" className="size-full object-cover" />
                  )}
                </span>
                <span className="grid min-w-0">
                  <span className="truncate font-medium">{p.name}</span>
                  {p.category && <span className="truncate text-xs font-normal text-muted-foreground">{p.category}</span>}
                </span>
              </span>
            ),
          },
          {
            header: t("store.status"),
            cell: (p) => (
              <span className="flex flex-wrap gap-1">
                <ProductBadge t={t} status={p.status} />
                {p.kind === "digital" && <Badge variant="outline">{t("store.kinds.digital")}</Badge>}
              </span>
            ),
          },
          { header: t("store.lager.onHand"), cell: stock, className: "tabular-nums" },
          // Phones: "2 verkauft" in the muted line (the table shows pieces + revenue).
          { header: t("store.sold"), cell: (p) => (sold.get(p.id)?.pieces ? t("store.soldShort", { count: sold.get(p.id)!.pieces }) : null), table: false },
          {
            header: t("store.sold"),
            phone: false,
            cell: (p) => {
              const s = sold.get(p.id)
              return s?.pieces ? (
                <span className="grid">
                  <span>{t("store.soldPieces", { count: s.pieces })}</span>
                  <span className="text-xs text-muted-foreground">{t.money(s.cents, "eur")}</span>
                </span>
              ) : (
                <span className="text-muted-foreground">–</span>
              )
            },
          },
          { header: t("store.price"), cell: (p) => t.money(p.price_cents, "eur"), className: "text-right tabular-nums" },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
    </>
  )
}

// Bestand: every physical item with what's on hand, held by open orders and still free; a row opens its booking sheet.
async function StockView({ ctx, t, sp, q, views }: { ctx: Ctx; t: T; sp: SearchParams; q?: string; views: { href: string; label: string; current: boolean }[] }) {
  const page = pageParam(sp)
  const all = await stockList(ctx.supabase, ctx.org.id)
  const found = q ? all.filter((i) => i.name!.toLowerCase().includes(q.toLowerCase())) : all
  const rows = found.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const editing = param(sp, "edit")
  const item = editing ? all.find((i) => i.item_id === editing) : undefined
  const num = (n: number | null) => (n === null ? "–" : String(n))

  return (
    <>
      <ListToolbar search={<SearchBox q={q} label={t("store.lager.search")} keep={{ view: "stock" }} />}>
        <Segments label={t("store.products")} items={views} className="md:ml-auto" />
      </ListToolbar>
      <DataTable
        rows={rows}
        rowKey={(i) => i.item_id!}
        rowHref={(i) => `/shop${withParams(sp, { edit: i.item_id!, ok: undefined, error: undefined })}`}
        empty={q ? t("store.noMatch") : <EmptyState area="shop" title={t("store.lager.empty")} text={t("store.lager.emptyText")} />}
        columns={[
          { header: t("store.lager.item"), cell: (i) => <span className="font-medium">{i.name}</span> },
          {
            header: t("store.lager.onHand"),
            className: "text-right",
            phone: "meta",
            cell: (i) => (i.stock === null ? <span className="text-muted-foreground">{t("store.lager.untracked")}</span> : <span className={cn("tabular-nums", (i.on_hand ?? 0) <= 0 && "font-medium text-destructive")}>{i.on_hand}</span>),
          },
          { header: t("store.lager.reserved"), cell: (i) => <span className="tabular-nums">{i.reserved || "–"}</span>, className: "text-right", phone: false },
          { header: t("store.lager.available"), cell: (i) => <span className="tabular-nums">{num(i.available)}</span>, className: "text-right", phone: "end" },
          { header: t("store.lager.sold"), cell: (i) => <span className="tabular-nums">{i.sold}</span>, className: "text-right", phone: false },
          { header: t("store.lager.lastMove"), cell: (i) => (i.last_move ? t.date(i.last_move, { dateStyle: "medium" }) : "–"), className: "whitespace-nowrap" },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={found.length > page * PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />
      {item && <StockSheet ctx={ctx} t={t} item={item} back="/shop" error={param(sp, "error")} toProduct />}
    </>
  )
}

export const instant = false
