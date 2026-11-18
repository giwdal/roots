"use server"

import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { removeImage, replaceImage } from "@/lib/images"
import { moneyCents } from "@/lib/inputs"
import { back } from "@/lib/url"
import { MAIL_KINDS, PRODUCT_STATUSES, readOptions, readProduct, readShippingRates, readStockMove, readTeamOrder, readVariant } from "@/shop/fields"
import { bookStock, stockItem } from "@/shop/stock"
import { applyOptions, cancelOrder, createTeamOrder, ensureInvoice, issueMissingInvoices, mail, markOrderPaid, refundShopOrder, setOrderStatus } from "@/shop/server"
import { deleteTrack, finishTrackUpload, startTrackUpload, updateTrack } from "@/shop/audio"

const UUID = /^[0-9a-f-]{36}$/
const id = (fd: FormData, k = "id") => {
  const v = String(fd.get(k) ?? "")
  return UUID.test(v) ? v : null
}
const getter = (fd: FormData) => (k: string) => String(fd.get(k) ?? "")
type T = Awaited<ReturnType<typeof getT>>
const msg = (t: T, key: string) => (t.has(key) ? t.dynamic(key) : t("store.failed"))

async function manager() {
  const ctx = await requirePerm("shop.manage")
  const t = await getT()
  if (!ctx.modules.has("shop")) back("/shop", { error: t("errors.not_allowed") })
  return { ctx, t }
}

// ---------- products ----------

/**
 * Create (→ its page) or update a product. The product page's one form also carries the variant rows
 * (`variant_key` + `<field>_<key>`; ids = existing, others new, missing existing ones deleted) and the single-track price.
 */
export async function saveProduct(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd)
  const here = productId ? `/shop/${productId}` : "/shop/new"
  const r = readProduct(getter(fd))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  if (!productId) {
    const { data, error } = await ctx.supabase.from("products").insert({ ...r.row, org_id: ctx.org.id }).select("id").single()
    if (error) back(here, { error: error.code === "23505" ? t("store.slugTaken") : dbError(t, error) })
    back(`/shop/${data.id}`, { ok: t("store.created") })
  }
  // Single tracks: one price for all of them (empty = album only); only sent while the product has tracks.
  const trackPrice = fd.has("track_price") ? String(fd.get("track_price") ?? "").trim() : null
  const trackCents = trackPrice ? moneyCents(trackPrice) : null
  if (trackPrice && (trackCents === null || trackCents > 1_000_000)) back(here, { error: t("store.priceInvalid") })
  const { error } = await ctx.supabase
    .from("products")
    .update({ ...r.row, ...(trackPrice !== null ? { track_price_cents: trackCents } : {}) })
    .eq("id", productId)
    .eq("org_id", ctx.org.id)
  if (error) back(here, { error: error.code === "23505" ? t("store.slugTaken") : dbError(t, error) })
  if (fd.get("variants_present") === "1") {
    const { data: p } = await ctx.supabase.from("products").select("images, product_variants(id)").eq("id", productId).eq("org_id", ctx.org.id).maybeSingle()
    if (!p) back(here, { error: t("errors.not_allowed") })
    const existing = new Set(p.product_variants.map((v) => v.id))
    const keys = fd.getAll("variant_key").map(String).slice(0, 200)
    for (const [position, key] of keys.entries()) {
      const v = readVariant((k) => String(fd.get(`${k}_${key}`) ?? ""))
      if ("error" in v) back(here, { error: msg(t, v.error) })
      const image = String(fd.get(`image_${key}`) ?? "")
      const row = { ...v.row, position, image_path: p.images.includes(image) ? image : null }
      const { error } = existing.has(key)
        ? await ctx.supabase.from("product_variants").update(row).eq("id", key).eq("product_id", productId).eq("org_id", ctx.org.id)
        : await ctx.supabase.from("product_variants").insert({ ...row, org_id: ctx.org.id, product_id: productId })
      if (error) back(here, { error: dbError(t, error) })
    }
    // Rows removed in the form (orders keep their own copy of name + price).
    const gone = [...existing].filter((v) => !keys.includes(v))
    if (gone.length) {
      const { error } = await ctx.supabase.from("product_variants").delete().in("id", gone).eq("product_id", productId).eq("org_id", ctx.org.id)
      if (error) back(here, { error: dbError(t, error) })
    }
  }
  back(here, { ok: t("store.saved") })
}

/** Publish (Im Shop), back to draft or archive: the product page's header buttons. */
export async function setProductStatus(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd)
  const status = PRODUCT_STATUSES.find((s) => s === fd.get("status"))
  if (!productId || !status) back("/shop", { error: t("errors.invalid_input") })
  const { error } = await ctx.supabase.from("products").update({ status }).eq("id", productId).eq("org_id", ctx.org.id)
  if (error) back(`/shop/${productId}`, { error: dbError(t, error) })
  back(`/shop/${productId}`, { ok: t.dynamic(`store.statusDone.${status}`) })
}

export async function trashProduct(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.products", p_id: String(fd.get("id") ?? "") })
  if (error) back(`/shop/${fd.get("id")}`, { error: dbError(t, error) })
  back("/shop", { ok: t("store.trashed") })
}

export async function restoreProduct(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = String(fd.get("id") ?? "")
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.products", p_id: productId })
  if (error) back(`/shop/${productId}`, { error: error.code === "23505" ? t("store.slugTaken") : dbError(t, error) })
  back(`/shop/${productId}`, { ok: t("store.restored") })
}

/** Pictures: upload one (appended), remove one, or make one the cover (first). */
export async function productImage(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd)
  const here = `/shop/${productId}`
  const { data: p } = await ctx.supabase.from("products").select("images").eq("id", productId ?? "").eq("org_id", ctx.org.id).maybeSingle()
  if (!p) back("/shop", { error: t("errors.not_allowed") })
  const path = String(fd.get("path") ?? "")
  let images = p.images
  if (fd.get("op") === "remove" && images.includes(path)) {
    images = images.filter((x) => x !== path)
    await removeImage(ctx.supabase, path)
  } else if (fd.get("op") === "cover" && images.includes(path)) {
    images = [path, ...images.filter((x) => x !== path)]
  } else {
    if (images.length >= 12) back(here, { error: t("store.tooManyImages") })
    const up = await replaceImage(ctx.supabase, `orgs/${ctx.org.id}/shop/${productId}`, fd.get("file"))
    if ("error" in up) back(here, { error: t.dynamic(`errors.${up.error}`) })
    images = [...images, up.path]
  }
  const { error } = await ctx.supabase.from("products").update({ images }).eq("id", productId!).eq("org_id", ctx.org.id)
  if (error) back(here, { error: dbError(t, error) })
  back(here, {})
}

/** Variant options (Farbe, Größe …): rows `option_name` + `option_values` (comma list) → variants per combination. */
export async function saveOptions(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd, "product_id")
  const here = `/shop/${productId}?edit=options`
  if (!productId) back("/shop", { error: t("errors.invalid_input") })
  const values = fd.getAll("option_values").map(String)
  const r = readOptions(fd.getAll("option_name").map((name, i) => ({ name: String(name), values: (values[i] ?? "").split(",") })))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  const res = await applyOptions(ctx.supabase, ctx.org.id, productId, r.options)
  if ("error" in res) back(here, { error: res.error === "db" ? dbError(t, res.db!) : msg(t, String(res.error)) })
  back(`/shop/${productId}`, { ok: t("store.optionsSaved", { created: res.created, removed: res.removed }) })
}

// ---------- orders ----------

type Ctx = Awaited<ReturnType<typeof manager>>["ctx"]

// Every order action: shop.manage, the order id from the form, errors and success as a toast on the order page.
async function orderStep(fd: FormData, run: (ctx: Ctx, orderId: string, t: T) => Promise<string | void>) {
  const { ctx, t } = await manager()
  const orderId = id(fd)
  const here = `/shop/orders/${orderId}`
  if (!orderId) back("/shop/orders", { error: t("errors.invalid_input") })
  let ok: string | void
  try {
    ok = await run(ctx, orderId, t)
  } catch (e) {
    const m = e instanceof Error ? e.message : ""
    // Unknown errors (e.g. the payment provider's own message): log them and show what the provider said.
    if (!t.has(m)) console.error("shop order step", orderId, e)
    back(here, { error: t.has(m) ? t.dynamic(m) : m ? t("store.failedWith", { message: m.slice(0, 300) }) : t("store.failed") })
  }
  deliverSoon()
  back(here, { ok: ok || t("store.saved") })
}
const payOrderOf = async (ctx: Ctx, orderId: string) => {
  const { data } = await ctx.supabase.from("shop_orders").select("order_id").eq("id", orderId).eq("org_id", ctx.org.id).maybeSingle()
  if (!data) throw new Error("errors.not_found")
  return data.order_id
}

export async function markPaidAction(fd: FormData) {
  await orderStep(fd, async (ctx, order, t) => {
    await markOrderPaid(ctx.org.id, order, fd.get("method") === "cash" ? "cash" : "transfer")
    return t("store.markedPaid")
  })
}

export async function orderStatusAction(fd: FormData) {
  const status = (["new", "ready", "shipped", "completed"] as const).find((s) => s === fd.get("status"))
  await orderStep(fd, async (ctx, order) => {
    if (!status) throw new Error("errors.invalid_input")
    await setOrderStatus(ctx.org.id, order, status, fd.has("tracking") ? String(fd.get("tracking")) : undefined)
  })
}

/** Cancel; a paid order is refunded in full, so that needs payments.refund too (an unpaid one only shop.manage). */
export async function cancelOrderAction(fd: FormData) {
  await orderStep(fd, async (ctx, order, t) => {
    const { data: o } = await ctx.supabase.from("shop_orders").select("pay_orders!inner(status)").eq("id", order).eq("org_id", ctx.org.id).maybeSingle()
    if (!o) throw new Error("errors.not_found")
    if (["paid", "partially_refunded"].includes(o.pay_orders.status) && !ctx.can("payments.refund")) throw new Error("errors.not_allowed")
    const r = await cancelOrder(ctx.org.id, order, String(fd.get("reason") ?? "").slice(0, 500) || undefined)
    return r === "pending" ? t("store.refundPending") : t("store.cancelled")
  })
}

/** Refund part of the order (pieces and/or another amount, drawer on the order page); needs payments.refund. */
export async function refundOrderAction(fd: FormData) {
  await orderStep(fd, async (ctx, order, t) => {
    if (!ctx.can("payments.refund")) throw new Error("errors.not_allowed")
    const r = await refundShopOrder(ctx.org.id, order, (k) => String(fd.get(k) ?? ""), fd.get("notify") === "1")
    return r === "pending" ? t("payments.refundPending") : t("store.refundDone")
  })
}

/** Shop → Bestellungen → ⋯: invoices for every paid order that has none yet. */
export async function issueMissingInvoicesAction() {
  const { ctx, t } = await manager()
  let done = 0
  try {
    done = await issueMissingInvoices(ctx.org.id)
  } catch (e) {
    back("/shop/orders", { error: msg(t, e instanceof Error ? e.message : "") })
  }
  back("/shop/orders", { ok: t("store.invoicesIssued", { count: done }) })
}

/** Issue the invoice now (auto invoices off, or the first try failed). */
export async function invoiceAction(fd: FormData) {
  await orderStep(fd, async (ctx, order, t) => {
    await ensureInvoice(await payOrderOf(ctx, order), true)
    const { data } = await ctx.supabase.from("shop_orders").select("invoice_error").eq("id", order).single()
    if (data?.invoice_error) throw new Error(`errors.${data.invoice_error}`)
    return t("store.invoiceIssued")
  })
}

export async function resendMailAction(fd: FormData) {
  const kind = MAIL_KINDS.find((k) => k === fd.get("kind"))
  await orderStep(fd, async (ctx, order, t) => {
    if (!kind) throw new Error("errors.invalid_input")
    if (!(await mail(kind, await payOrderOf(ctx, order)))) throw new Error("store.mailNotSent")
    return t("store.mailSent")
  })
}

// ---------- settings ----------

const readMails = (fd: FormData) =>
  Object.fromEntries(MAIL_KINDS.map((k) => [k, { off: fd.get(`mail_${k}`) !== "1", message: String(fd.get(`mail_${k}_message`) ?? "").trim().slice(0, 2000) || undefined }]))

/** Only the buyer mails (E-Mail → Vorlagen shows them too). */
export async function saveShopMails(fd: FormData) {
  const { ctx, t } = await manager()
  const here = "/email/templates"
  const { error } = await ctx.supabase.from("shop_settings").upsert({ org_id: ctx.org.id, mails: readMails(fd) as never }, { onConflict: "org_id" })
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("store.saved") })
}

export async function saveShopSettings(fd: FormData) {
  const { ctx, t } = await manager()
  const here = "/shop/settings"
  const on = (k: string) => fd.get(k) === "1"
  const text = (k: string, max: number) => String(fd.get(k) ?? "").trim().slice(0, max) || null
  // Shipping rates come as parallel lists (one row per rate; empty names are dropped).
  const list = (k: string) => fd.getAll(k).map(String)
  const rates = list("rate_name").map((name, i) => ({
    id: list("rate_id")[i] || crypto.randomUUID().slice(0, 8),
    name,
    cents: moneyCents(list("rate_price")[i] || "0"),
    free_from: list("rate_free")[i]?.trim() ? moneyCents(list("rate_free")[i]) : null,
    countries: list("rate_countries")[i] || "DE",
  }))
  const mails = readMails(fd)
  const days = Math.floor(Number(fd.get("transfer_days")) || 7)
  const { error } = await ctx.supabase.from("shop_settings").upsert(
    {
      org_id: ctx.org.id,
      title: text("title", 200),
      intro: text("intro", 5000),
      pay_online: on("pay_online"),
      pay_transfer: on("pay_transfer"),
      pay_on_pickup: on("pay_on_pickup"),
      transfer_days: Math.min(60, Math.max(1, days)),
      pickup: on("pickup"),
      pickup_text: text("pickup_text", 2000),
      shipping: on("shipping"),
      shipping_rates: readShippingRates(rates) as never,
      auto_invoice: on("auto_invoice"),
      terms: text("terms", 50000),
      withdrawal: text("withdrawal", 50000),
      mails: mails as never,
    },
    { onConflict: "org_id" },
  )
  if (error) back(here, { error: dbError(t, error) })
  back(here, { ok: t("store.saved") })
}

/** Music upload, step 1 (called from the browser): the track row + a link to PUT the master to. */
export async function startAudioUpload(productId: string, name: string, size: number): Promise<{ id: string; url: string } | { error: string }> {
  const { ctx, t } = await manager()
  const r = await startTrackUpload(ctx.supabase, ctx.org.id, productId, { name: String(name), size: Number(size) })
  if ("error" in r) return { error: r.error === "db" ? dbError(t, r.db!) : t.dynamic(String(r.error), { max: "250 MB" }) }
  return { id: r.id, url: r.uploadUrl }
}

/** Step 2: the upload is done → convert (runs in the background, the page shows the status). */
export async function finishAudioUpload(trackId: string): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const r = await finishTrackUpload(ctx.supabase, ctx.org.id, trackId)
  return "error" in r ? { error: r.error === "db" ? dbError(t, r.db!) : t.dynamic(String(r.error)) } : {}
}

/** One track: `delete` removes it with its files, `retry` converts it again, else its number, title and switches. */
export async function saveTrack(fd: FormData) {
  const { ctx, t } = await manager()
  const productId = id(fd, "product_id")
  const trackId = id(fd)
  const here = `/shop/${productId}`
  if (!productId || !trackId) back("/shop", { error: t("errors.invalid_input") })
  const r = fd.get("delete")
    ? await deleteTrack(ctx.supabase, ctx.org.id, trackId)
    : fd.get("retry")
      ? await finishTrackUpload(ctx.supabase, ctx.org.id, trackId)
      : await updateTrack(ctx.supabase, ctx.org.id, trackId, {
          title: String(fd.get("title") ?? ""),
          position: Number(fd.get("position")) || 0,
          stream: fd.get("stream") === "1",
          ...(fd.get("has_buyable") === "1" ? { buyable: fd.get("buyable") === "1" } : {}),
        })
  if ("error" in r) back(fd.get("delete") || fd.get("retry") ? here : `${here}?edit=${trackId}`, { error: r.error === "db" ? dbError(t, r.db!) : t.dynamic(String(r.error)) })
  back(here, { ok: fd.get("delete") ? t("store.trackRemoved") : t("store.saved") }) // the catalog is read live, no cache to refresh
}

// ---------- Lager ----------

/** Book a movement on one item (drawer on Shop → Lager). */
export async function bookStockAction(fd: FormData) {
  const { ctx, t } = await manager()
  const itemId = id(fd, "item")
  // Back to where the sheet was opened (Produkte › Bestand or the product page), the sheet still open.
  const from = String(fd.get("back") ?? "")
  const page = /^\/shop(\/[0-9a-f-]{36})?$/.test(from) ? from : "/shop"
  const list = page === "/shop" ? "/shop?view=stock" : page
  const here = `${list}${list.includes("?") ? "&" : "?"}edit=${itemId}`
  const item = itemId && (await stockItem(ctx.supabase, ctx.org.id, itemId))
  if (!item) back(list, { error: t("errors.not_found") })
  const r = readStockMove(getter(fd), item.on_hand ?? 0)
  if ("error" in r) back(here, { error: msg(t, r.error) })
  try {
    await bookStock(ctx.supabase, ctx.org.id, item, r)
  } catch (e) {
    const m = e instanceof Error ? e.message : ""
    if (!t.has(m)) console.error("shop stock", itemId, e)
    back(here, { error: msg(t, m) })
  }
  deliverSoon()
  back(here, { ok: t("store.lager.booked") })
}

// ---------- orders entered by the team ----------

/** The picked CRM contact's details for the "Neue Bestellung" form. */
export async function orderBuyer(contactId: string) {
  const ctx = await requirePerm("shop.manage")
  if (!UUID.test(contactId)) return null
  const { data: c } = await ctx.supabase.from("contacts").select("first_name, last_name, company, email, phone, street, postal_code, city, country").eq("id", contactId).eq("org_id", ctx.org.id).maybeSingle()
  return c && { first_name: c.first_name ?? "", last_name: c.last_name ?? "", email: c.email ?? "", phone: c.phone ?? "", company: c.company ?? "", street: c.street ?? "", postal_code: c.postal_code ?? "", city: c.city ?? "", country: c.country ?? "DE" }
}

/** Item picker of "Neue Bestellung": products and their variants matching `q` (drafts too), with the price to fill in. */
export async function searchOrderItems(q: string): Promise<{ id: string; label: string; detail: string; price: number }[]> {
  const ctx = await requirePerm("shop.manage")
  const t = await getT()
  const term = String(q ?? "").replace(/[%,()*]/g, "").trim().slice(0, 100)
  let query = ctx.supabase
    .from("products")
    .select("id, name, price_cents, position, product_variants(id, name, price_cents, position, active)")
    .eq("org_id", ctx.org.id)
    .is("deleted_at", null)
    .neq("status", "archived")
    .order("position")
    .limit(20)
  if (term) query = query.or(`name.ilike.%${term}%,category.ilike.%${term}%`)
  const { data } = await query
  return (data ?? [])
    .flatMap((p) =>
      p.product_variants.length
        ? [...p.product_variants]
            .filter((v) => v.active)
            .sort((a, b) => a.position - b.position)
            .map((v) => ({ id: v.id, label: `${p.name} · ${v.name}`, price: v.price_cents ?? p.price_cents }))
        : [{ id: p.id, label: p.name, price: p.price_cents }],
    )
    .slice(0, 20)
    .map((i) => ({ ...i, detail: t.money(i.price, "eur") }))
}

/** "Neue Bestellung" (sold offline, by phone …) → the new order's page. */
export async function createTeamOrderAction(fd: FormData) {
  const { ctx, t } = await manager()
  const here = "/shop/orders/new"
  const r = readTeamOrder(getter(fd))
  if ("error" in r) back(here, { error: msg(t, r.error) })
  let id = ""
  try {
    id = await createTeamOrder(ctx.org.id, r.order)
  } catch (e) {
    const m = e instanceof Error ? e.message : ""
    if (!t.has(m)) console.error("team order", e)
    back(here, { error: msg(t, m) })
  }
  deliverSoon()
  back(`/shop/orders/${id}`, { ok: t("store.teamOrder.created") })
}
