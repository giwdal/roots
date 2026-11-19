import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArchiveIcon, CheckCircle2Icon, CircleIcon, ExternalLinkIcon, EyeOffIcon, ReceiptIcon, RefreshCwIcon, RotateCcwIcon, SendIcon, SlidersHorizontalIcon, StarIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { FileList } from "@/components/file-list"
import { MultiSelect } from "@/components/multi-select"
import { Notice } from "@/components/notice"
import { Page, PageHeader, RecordLayout } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { MoreDetails, Section } from "@/components/section"
import { TitleTip } from "@/components/info-tip"
import { Stat, Stats } from "@/components/stats"
import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { AutoRefresh } from "@/app/s/[site]/t/[order]/auto-refresh"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { imageUrl } from "@/lib/images"
import { createAdminClient } from "@/lib/supabase/admin"
import { param, siteUrl } from "@/lib/url"
import { productTrackList } from "@/shop/audio"
import type { ProductOption } from "@/shop/fields"
import { stockItem } from "@/shop/stock"
import { priceInput } from "@/tickets/price"
import { productImage, restoreProduct, saveOptions, saveProduct, saveTrack, setProductStatus, trashProduct } from "../actions"
import { ProductBadge } from "../badges"
import { DescriptionField, MoreFields, ProductFields, StockField, moreSet } from "../product-form"
import { StockSheet } from "../stock-sheet"
import { AudioUpload } from "./audio-upload"
import { PictureAdd } from "./picture-add"
import { VariantRows } from "./variant-rows"

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
const mb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`

// One product, opened on how it sells (sold, revenue, still free) and, while a draft, what's missing before it goes
// live. Then the pictures (rail; first on phones, like Shopify), one form with one SaveBar (details, stock + variants,
// shop page; an editor like Shopify's product page, not inline fields), the music and downloads.
// Sheets (?edit=): options, one track, a stock booking for the product or a variant.
export default async function ProductPage({ params, searchParams }: PageProps<"/shop/[id]">) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound()
  const sp = await searchParams
  if (param(sp, "tab")) redirect(`/shop/${id}`)
  const ctx = await requirePerm("shop.view")
  const t = await getT()
  const canManage = ctx.can("shop.manage")
  const [{ data: p }, { data: variants }, tracks, { data: billing }, { data: sales }] = await Promise.all([
    ctx.supabase.from("products").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase.from("product_variants").select("*").eq("product_id", id).eq("org_id", ctx.org.id).order("position").order("created_at"),
    productTrackList(ctx.supabase, ctx.org.id, id),
    ctx.supabase.from("org_billing").select("tax_mode").eq("org_id", ctx.org.id).maybeSingle(),
    ctx.supabase
      .from("pay_order_items")
      .select("quantity, refunded_quantity, unit_amount, pay_orders!inner(status, source_module)")
      .eq("org_id", ctx.org.id)
      .eq("pay_orders.source_module", "shop")
      .in("pay_orders.status", ["paid", "partially_refunded"])
      .eq("metadata->>product_id", id),
  ])
  if (!p) notFound()
  const here = `/shop/${id}`
  const live = !p.deleted_at
  // Units still free (stock − paid − held by open orders); the product's own stock only counts without variants.
  const admin = createAdminClient()
  const stockItems = variants?.length ? variants.map((v) => ({ id: v.id, stock: v.stock, digital: v.digital })) : [{ id: p.id, stock: p.stock, digital: p.kind === "digital" }]
  const left = new Map(await Promise.all(stockItems.map(async (i) => [i.id, i.stock === null ? null : (await admin.rpc("shop_left", { p_item: i.id, p_stock: i.stock })).data] as const)))
  const leftLabel = (itemId: string, stock: number | null) => (stock === null ? t("store.unlimited") : t("store.leftOf", { left: Math.max(0, left.get(itemId) ?? 0), stock }))
  const counted = stockItems.filter((i) => i.stock !== null && !i.digital)
  const free = counted.reduce((s, i) => s + Math.max(0, left.get(i.id) ?? 0), 0)
  const pieces = (sales ?? []).reduce((s, i) => s + i.quantity - i.refunded_quantity, 0)
  const revenue = (sales ?? []).reduce((s, i) => s + (i.quantity - i.refunded_quantity) * i.unit_amount, 0)
  const options = (p.options ?? []) as ProductOption[]
  const zips = (p.audio_zips ?? {}) as { zip?: { size: number } }
  const busyAudio = tracks.some((x) => x.status === "pending" || x.status === "processing") || (tracks.some((x) => x.status === "ready") && !Object.keys(zips).length)
  const edit = param(sp, "edit")
  const editTrack = edit ? tracks.find((x) => x.id === edit) : undefined
  const stockEdit = edit && stockItems.some((i) => i.id === edit) ? await stockItem(ctx.supabase, ctx.org.id, edit) : null
  const images = p.images.map((path) => ({ path, url: imageUrl(path) ?? "" }))
  const statusForm = (status: string) => (
    <form id={`p-status-${status}`} action={setProductStatus} hidden>
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="status" value={status} />
    </form>
  )
  // Before it goes live: what a good product page has, each step one click away.
  const steps =
    live && p.status === "draft"
      ? [
          { done: p.images.length > 0, label: t("store.steps.image"), href: "#images" },
          { done: !!p.description, label: t("store.steps.description"), href: "#page" },
          ...(p.kind === "digital" ? [{ done: tracks.length > 0, label: t("store.steps.content"), href: "#music" }] : []),
        ]
      : []

  return (
    <Page size="record">
      <PageHeader
        crumbs={[{ href: "/shop", label: t("store.products") }, { label: p.name }]}
        title={p.name}
        badge={live ? <ProductBadge t={t} status={p.status} /> : <Badge variant="destructive">{t("store.inTrashBadge")}</Badge>}
        meta={[t.money(p.price_cents, "eur"), p.category, p.release_at && t("store.releaseShort", { date: t.date(p.release_at, { dateStyle: "medium" }) })].filter(Boolean).join(" · ")}
        actions={
          live &&
          p.status === "published" && (
            <Button render={<a href={siteUrl(ctx.org.slug, `/shop/${p.slug}`, ctx.org.site_domain)} target="_blank" rel="noreferrer" />} nativeButton={false} size="sm" variant="outline">
              <ExternalLinkIcon /> {t("store.viewPublic")}
            </Button>
          )
        }
        menu={
          canManage &&
          live && (
            <ActionsMenu>
              {!variants?.length && p.kind === "physical" && (
                <MenuLink href={`/shop/orders/new?item=${p.id}`} icon={<ReceiptIcon />}>
                  {t("store.recordSale")}
                </MenuLink>
              )}
              {p.status === "published" && (
                <MenuSubmit form="p-status-draft" icon={<EyeOffIcon />} confirm="store.confirmUnpublish">
                  {t("store.unpublish")}
                </MenuSubmit>
              )}
              {p.status !== "archived" && (
                <MenuSubmit form="p-status-archived" icon={<ArchiveIcon />} confirm="store.confirmArchive">
                  {t("store.archive")}
                </MenuSubmit>
              )}
              <MenuSeparator />
              <MenuSubmit form="trash-product" icon={<Trash2Icon />} destructive>
                {t("store.toTrash")}
              </MenuSubmit>
            </ActionsMenu>
          )
        }
        primary={
          !canManage ? undefined : !live ? (
            <form action={restoreProduct}>
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton size="sm">
                <RotateCcwIcon /> {t("store.restore")}
              </SubmitButton>
            </form>
          ) : p.status !== "published" ? (
            <form action={setProductStatus}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="status" value="published" />
              <SubmitButton size="sm">
                <SendIcon /> {t("store.publish")}
              </SubmitButton>
            </form>
          ) : undefined
        }
      />
      {canManage && live && (
        <>
          {statusForm("draft")}
          {statusForm("archived")}
          <form id="trash-product" action={trashProduct} hidden>
            <input type="hidden" name="id" value={p.id} />
          </form>
          {p.images.map((path, i) => (
            <div key={path} hidden>
              <form id={`img-cover-${i}`} action={productImage}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="op" value="cover" />
                <input type="hidden" name="path" value={path} />
              </form>
              <form id={`img-remove-${i}`} action={productImage}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="op" value="remove" />
                <input type="hidden" name="path" value={path} />
              </form>
            </div>
          ))}
          {tracks.map((x) =>
            (["delete", "retry"] as const).map((kind) => (
              <form key={`${kind}-${x.id}`} id={`track-${kind}-${x.id}`} action={saveTrack} hidden>
                <input type="hidden" name="id" value={x.id} />
                <input type="hidden" name="product_id" value={p.id} />
                <input type="hidden" name={kind} value="1" />
              </form>
            )),
          )}
        </>
      )}
      <Notice error={edit ? undefined : param(sp, "error")} ok={param(sp, "ok")} />

      {!live ? (
        <p className="rounded-lg border bg-muted px-3 py-2 text-sm">{t("store.inTrash")}</p>
      ) : (
        <>
          <Stats>
            <Stat label={t("store.sold")} value={pieces} hint={t("store.stats.soldHint")} />
            <Stat label={t("store.stats.revenue")} value={t.money(revenue, "eur")} />
            <Stat
              label={t("store.lager.available")}
              value={counted.length ? free : t("store.unlimited")}
              hint={counted.length ? t("store.stats.freeHint") : undefined}
              href={counted.length ? (variants?.length ? `/shop?view=stock&q=${encodeURIComponent(p.name)}` : `${here}?edit=${p.id}`) : undefined}
            />
          </Stats>
          {steps.length > 0 && (
            <Section id="steps" title={t("store.steps.title")} description={t("store.steps.text")}>
              <ul className="grid gap-1">
                {steps.map((s) => (
                  <li key={s.label}>
                    <a href={s.href} className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted">
                      {s.done ? <CheckCircle2Icon className="size-4 text-[var(--success)]" /> : <CircleIcon className="size-4 text-muted-foreground" />}
                      <span className={s.done ? "text-muted-foreground line-through" : ""}>{s.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <RecordLayout
            aside={null}
            top={
              <Section id="images" title={t("store.images")} description={t("store.imagesHint")}>
                <ul className="grid grid-cols-3 gap-2">
                  {p.images.map((path, i) => (
                    <li key={path} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element -- public bucket URL */}
                      <img src={imageUrl(path)} alt="" className="size-full object-cover" />
                      {i === 0 && (
                        <Badge variant="secondary" className="absolute bottom-1 left-1">
                          {t("store.cover")}
                        </Badge>
                      )}
                      {canManage && (
                        <div className="absolute top-1 right-1 [&_button]:bg-background/90">
                          <ActionsMenu label={t("store.imageActions", { n: i + 1 })}>
                            {i > 0 && (
                              <MenuSubmit form={`img-cover-${i}`} icon={<StarIcon />}>
                                {t("store.makeCover")}
                              </MenuSubmit>
                            )}
                            <MenuSubmit form={`img-remove-${i}`} icon={<Trash2Icon />} destructive confirm="store.confirmRemoveImage">
                              {t("store.removeImage")}
                            </MenuSubmit>
                          </ActionsMenu>
                        </div>
                      )}
                    </li>
                  ))}
                  {canManage && p.images.length < 12 && (
                    <li>
                      <PictureAdd productId={p.id} />
                    </li>
                  )}
                </ul>
                {!canManage && !p.images.length && <p className="text-sm text-muted-foreground">–</p>}
              </Section>
            }
          >
            <form action={saveProduct} className="grid gap-6">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="status" value={p.status} />
              <Section id="details" title={t("store.product")}>
                <ProductFields t={t} p={p} small={billing?.tax_mode === "small_business"} disabled={!canManage} />
              </Section>
              <Section
                id="variants"
                title={variants?.length ? <TitleTip tip={t("store.variantsHint")}>{t("store.variants")}</TitleTip> : t("store.stockTitle")}
                action={
                  canManage && (
                    <Button render={<Link href={`${here}?edit=options`} scroll={false} />} nativeButton={false} size="sm" variant="outline">
                      <SlidersHorizontalIcon /> {t("store.options")}
                    </Button>
                  )
                }
              >
                {/* Without variants one stock for the product; with variants every row has its own. */}
                {variants?.length ? <input type="hidden" name="stock" value={p.stock ?? ""} /> : <StockField t={t} p={p} disabled={!canManage} />}
                {!variants?.length && p.stock !== null && p.kind === "physical" && (
                  <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
                    {leftLabel(p.id, p.stock)}
                    {canManage && (
                      <Link href={`${here}?edit=${p.id}`} scroll={false} className="text-[var(--link)] hover:underline">
                        {t("store.lager.bookShort")}
                      </Link>
                    )}
                  </p>
                )}
                <VariantRows
                  initial={(variants ?? []).map((v) => ({
                    id: v.id,
                    name: v.name,
                    values: v.option_values,
                    price: v.price_cents === null ? "" : priceInput(v.price_cents),
                    stock: v.stock === null ? "" : String(v.stock),
                    left: leftLabel(v.id, v.stock),
                    image: v.image_path ?? "",
                    active: v.active,
                    digital: v.digital,
                    nyp: v.name_your_price ?? p.name_your_price,
                    book: canManage && v.stock !== null && !v.digital ? `${here}?edit=${v.id}` : undefined,
                  }))}
                  placeholderPrice={priceInput(p.price_cents)}
                  images={images}
                  canAdd={!options.length}
                  disabled={!canManage}
                />
              </Section>
              <Section id="page" title={t("store.productPage")}>
                <DescriptionField t={t} p={p} disabled={!canManage} />
              </Section>
              {tracks.length > 0 && (
                <Section id="track-price" title={<TitleTip tip={t("store.trackPriceHint")}>{t("store.trackPrice")}</TitleTip>}>
                  <TypedInput kind="money" id="track-price" name="track_price" defaultValue={p.track_price_cents != null ? priceInput(p.track_price_cents) : ""} placeholder="–" disabled={!canManage} aria-label={t("store.trackPrice")} />
                </Section>
              )}
              <MoreDetails label={t("common.moreDetails")} open={moreSet(p)}>
                <div id="more">
                  <MoreFields t={t} p={p} disabled={!canManage} />
                </div>
              </MoreDetails>
              {canManage && <SaveBar />}
            </form>

            <Section id="music" title={<TitleTip tip={t("store.tracksInfo")}>{t("store.tracks")}</TitleTip>} description={t("store.tracksHint")}>
              {busyAudio && <AutoRefresh />}
              {tracks.length > 0 && (
                <ol className="grid divide-y rounded-lg border">
                  {tracks.map((x, i) => (
                    <li key={x.id} className="flex items-center gap-2 pr-2">
                      <Link href={`${here}?edit=${x.id}`} scroll={false} className="flex min-h-12 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                        <span className="w-6 shrink-0 text-right text-muted-foreground tabular-nums">{x.position || i + 1}</span>
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate font-medium">{x.title}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[
                              x.duration_seconds ? clock(x.duration_seconds) : null,
                              x.status === "ready" ? (["wav", "mp3"] as const).flatMap((f) => (x.formats[f] ? [`${t.dynamic(`store.audioFormats.${f}`)} ${mb(x.formats[f]!.size)}`] : [])).join(" · ") : null,
                              x.stream ? t("store.trackStream") : null,
                              p.track_price_cents != null && x.buyable ? t("store.trackBuyable") : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {x.status === "failed" && x.error && <span className="truncate text-xs text-destructive">{x.error}</span>}
                        </span>
                        {x.status !== "ready" && <Badge variant={x.status === "failed" ? "destructive" : "info"}>{t.dynamic(`store.trackStatus.${x.status}`)}</Badge>}
                      </Link>
                      {canManage && (x.status === "failed" || x.status === "uploading") && (
                        <SubmitButton form={`track-retry-${x.id}`} size="icon-sm" variant="ghost" aria-label={t("store.trackRetry")} title={t("store.trackRetry")}>
                          <RefreshCwIcon />
                        </SubmitButton>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {tracks.some((x) => x.status === "ready") && <p className="text-xs text-muted-foreground">{zips.zip ? t("store.zipsReady", { list: mb(zips.zip.size) }) : t("store.zipsPreparing")}</p>}
              {canManage ? <AudioUpload productId={p.id} /> : !tracks.length && <p className="text-sm text-muted-foreground">–</p>}
            </Section>

            {ctx.can("org.files.view") && (
              <Section id="downloads" title={<TitleTip tip={t("store.downloadsHint")}>{t("store.downloads")}</TitleTip>}>
                <FileList ctx={ctx} entity="products" entityId={p.id} back={here} hideTitle />
              </Section>
            )}
          </RecordLayout>
        </>
      )}

      {canManage && live && edit === "options" && (
        <UrlSheet params={["edit"]} title={t("store.options")} description={t("store.optionsHint")}>
          <Notice error={param(sp, "error")} />
          <form action={saveOptions} className="grid gap-3">
            <input type="hidden" name="product_id" value={p.id} />
            {/* Up to 3 options; saving makes one variant per combination (existing combinations keep stock/price). */}
            {[...options, ...Array(Math.max(0, Math.min(3, options.length + 1) - options.length)).fill(null)].map((o: ProductOption | null, i) => (
              <div key={o?.name ?? `new-${i}`} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <Input name="option_name" defaultValue={o?.name ?? ""} maxLength={40} placeholder={t("store.optionNamePlaceholder")} aria-label={t("store.optionName")} />
                <MultiSelect name="option_values" joined creatable options={(o?.values ?? []).map((v) => ({ value: v, label: v }))} defaultValue={o?.values ?? []} placeholder={t("store.optionValuesPlaceholder")} />
              </div>
            ))}
            <SubmitButton className="w-full sm:w-auto sm:justify-self-end" data-confirm={variants?.length ? "store.confirmOptions" : undefined}>
              {t("store.saveOptions")}
            </SubmitButton>
          </form>
        </UrlSheet>
      )}
      {canManage && live && editTrack && (
        <UrlSheet
          params={["edit"]}
          title={editTrack.title}
          meta={[editTrack.master_name, editTrack.duration_seconds ? clock(editTrack.duration_seconds) : null].filter(Boolean).join(" · ")}
          menu={
            <ActionsMenu>
              {(editTrack.status === "failed" || editTrack.status === "uploading") && (
                <MenuSubmit form={`track-retry-${editTrack.id}`} icon={<RefreshCwIcon />}>
                  {t("store.trackRetry")}
                </MenuSubmit>
              )}
              <MenuSubmit form={`track-delete-${editTrack.id}`} icon={<Trash2Icon />} destructive confirm="store.confirmRemoveTrack">
                {t("store.removeTrack")}
              </MenuSubmit>
            </ActionsMenu>
          }
        >
          <Notice error={param(sp, "error")} />
          <form action={saveTrack} className="grid gap-4">
            <input type="hidden" name="id" value={editTrack.id} />
            <input type="hidden" name="product_id" value={p.id} />
            {p.track_price_cents != null && <input type="hidden" name="has_buyable" value="1" />}
            <div className="grid grid-cols-[5rem_1fr] gap-3">
              <div className="grid gap-2">
                <Label htmlFor="track-no">{t("store.trackNumber")}</Label>
                <TypedInput kind="number" id="track-no" name="position" min={0} defaultValue={String(editTrack.position || tracks.indexOf(editTrack) + 1)} className="w-full" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="track-title">{t("store.trackTitle")}</Label>
                <Input id="track-title" name="title" required maxLength={200} defaultValue={editTrack.title} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="stream" value="1" defaultChecked={editTrack.stream} className="size-4 accent-primary" /> {t("store.trackStream")}
            </label>
            {p.track_price_cents != null && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="buyable" value="1" defaultChecked={editTrack.buyable} className="size-4 accent-primary" /> {t("store.trackBuyable")}
              </label>
            )}
            <SaveBar />
          </form>
        </UrlSheet>
      )}
      {live && stockEdit && <StockSheet ctx={ctx} t={t} item={stockEdit} back={here} error={param(sp, "error")} />}
    </Page>
  )
}

export const instant = false
