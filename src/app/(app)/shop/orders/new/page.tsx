import { notFound } from "next/navigation"
import { NewPage } from "@/components/new-page"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { param, type SearchParams } from "@/lib/url"
import { NewOrderForm, type OrderItem } from "./new-order-form"

// "Neue Bestellung": a sale made outside the online shop (merch table, phone, mail). ?item=<variant or product id>
// starts with that item (from the Bestand view).
export default async function NewOrderPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ctx = await requirePerm("shop.manage")
  if (!ctx.modules.has("shop")) notFound()
  const [t, sp] = await Promise.all([getT(), searchParams])
  const itemId = /^[0-9a-f-]{36}$/.test(param(sp, "item") ?? "") ? param(sp, "item")! : null
  const [{ data: variant }, { data: product }] = itemId
    ? await Promise.all([
        ctx.supabase.from("product_variants").select("id, name, price_cents, products(name, price_cents)").eq("id", itemId).eq("org_id", ctx.org.id).maybeSingle(),
        ctx.supabase.from("products").select("id, name, price_cents").eq("id", itemId).eq("org_id", ctx.org.id).maybeSingle(),
      ])
    : [{ data: null }, { data: null }]
  const price = variant ? (variant.price_cents ?? variant.products?.price_cents ?? 0) : (product?.price_cents ?? 0)
  const initial: OrderItem | null = variant
    ? { id: variant.id, label: `${variant.products?.name ?? ""} · ${variant.name}`, price, detail: t.money(price, "eur") }
    : product
      ? { id: product.id, label: product.name, price, detail: t.money(price, "eur") }
      : null
  return (
    <NewPage list={{ href: "/shop/orders", label: t("store.orders") }} title={t("store.teamOrder.new")} error={param(sp, "error")}>
      <p className="text-sm text-muted-foreground">{t("store.teamOrder.hint")}</p>
      <NewOrderForm currency="eur" initialItem={initial} />
    </NewPage>
  )
}

export const instant = false
