// Lager: stock per physical item (product without variants, or physical variant) and movements with a reason. Sales
// (online or offline) are orders and only show up here as such. Callers check shop.view / shop.manage; `client` is the
// caller's (RLS) client or the API's key client, both scoped to the org.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/types"
import type { StockMove } from "./fields"

type Db = SupabaseClient<Database>

export type StockItem = Awaited<ReturnType<typeof stockList>>[number]

/** Every physical item: received (stock), sold, reserved, on hand = stock − sold, available = on hand − reserved. */
export async function stockList(client: Db, orgId: string) {
  const { data, error } = await client.rpc("shop_stock", { p_org: orgId })
  if (error) throw error
  return (data ?? []).map((r) => ({
    ...r,
    name: r.variant ? `${r.product} – ${r.variant}` : r.product,
    on_hand: r.stock === null ? null : r.stock - r.sold,
    available: r.stock === null ? null : r.stock - r.sold - r.reserved,
  }))
}

export async function stockItem(client: Db, orgId: string, itemId: string) {
  return (await stockList(client, orgId)).find((i) => i.item_id === itemId) ?? null
}

/** One item's timeline: movements + shop sales (order lines of paid orders), newest first. */
export async function stockHistory(client: Db, orgId: string, itemId: string) {
  const [{ data: moves }, { data: lines }] = await Promise.all([
    client
      .from("stock_moves")
      .select("id, quantity, reason, note, created_at, created_by")
      .eq("org_id", orgId)
      .or(`variant_id.eq.${itemId},and(product_id.eq.${itemId},variant_id.is.null)`)
      .order("created_at", { ascending: false })
      .limit(200),
    client
      .from("pay_order_items")
      .select("quantity, refunded_quantity, pay_orders!inner(status, paid_at, shop_orders(id, number, name))")
      .eq("org_id", orgId)
      .eq("source_id", itemId)
      .eq("pay_orders.source_module", "shop")
      .in("pay_orders.status", ["paid", "partially_refunded", "refunded"])
      .limit(200),
  ])
  const sales = (lines ?? []).flatMap((l) => {
    const so = l.pay_orders.shop_orders // 1:1
    const at = l.pay_orders.paid_at
    if (!at) return []
    const out = [{ id: `${so?.id}-sale`, kind: "sale" as "sale" | "returned", quantity: -l.quantity, note: so?.name ?? null, at, order: so ? { id: so.id, number: so.number } : null }]
    if (l.refunded_quantity) out.push({ id: `${so?.id}-back`, kind: "returned" as const, quantity: l.refunded_quantity, note: null, at, order: out[0].order })
    return out
  })
  return [...(moves ?? []).map((m) => ({ id: m.id, kind: m.reason, quantity: m.quantity, note: m.note, at: m.created_at, order: null })), ...sales].sort((a, b) => b.at.localeCompare(a.at))
}

/** Book a movement; the DB adds it to the stock (and refuses going below zero). Throws message keys. */
export async function bookStock(client: Db, orgId: string, item: StockItem, input: StockMove) {
  const { error } = await client.from("stock_moves").insert({ org_id: orgId, product_id: item.product_id!, variant_id: item.variant_id, ...input.move })
  if (error) throw new Error(error.message === "stock_negative" ? "errors.stock_negative" : error.message)
}
