import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { Notice } from "@/components/notice"
import type { T } from "@/i18n/translate"
import { cn } from "@/lib/utils"
import type { StockItem } from "@/shop/stock"
import { stockHistory } from "@/shop/stock"
import type { getContext } from "@/lib/context"
import { StockForm } from "./stock-form"

const num = (n: number | null) => (n === null ? "–" : String(n))

/**
 * One physical item's stock as a sheet (?edit=<item id>): what's on hand, booking a movement, and the history
 * (movements + sales). Opened from Produkte › Bestand and from the product page; `back` is where booking returns to.
 */
export async function StockSheet({ ctx, t, item, back, error, toProduct }: { ctx: Awaited<ReturnType<typeof getContext>>; t: T; item: StockItem; back: string; error?: string; toProduct?: boolean }) {
  const history = await stockHistory(ctx.supabase, ctx.org.id, item.item_id!)
  const manage = ctx.can("shop.manage")
  return (
    <UrlSheet
      params={["edit"]}
      title={item.name!}
      meta={t("store.lager.meta", { onHand: num(item.on_hand), reserved: String(item.reserved), available: num(item.available), sold: String(item.sold) })}
      actions={
        toProduct && (
          <Button render={<Link href={`/shop/${item.product_id}`} />} nativeButton={false} size="sm" variant="outline">
            {t("store.lager.toProduct")}
          </Button>
        )
      }
    >
      <div className="grid gap-6">
        <Notice error={error} />
        {manage && <StockForm item={item.item_id!} onHand={item.on_hand ?? 0} back={back} />}
        {manage && (
          <p className="text-sm text-muted-foreground">
            {t("store.lager.saleHint")}{" "}
            <Link href={`/shop/orders/new?item=${item.item_id}`} className="text-[var(--link)] hover:underline">
              {t("store.lager.saleLink")}
            </Link>
          </p>
        )}
        <section className="grid gap-2">
          <h3 className="text-sm font-medium">{t("store.lager.history")}</h3>
          {history.length ? (
            <ul className="grid divide-y rounded-lg border text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-3 py-2">
                  <span className={cn("w-12 shrink-0 text-right font-medium tabular-nums", h.quantity < 0 ? "text-destructive" : "text-foreground")}>{h.quantity > 0 ? `+${h.quantity}` : h.quantity}</span>
                  <span className="grid min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{t.dynamic(`store.lager.reasons.${h.kind}`)}</Badge>
                      {h.order && (
                        <Link href={`/shop/orders/${h.order.id}`} className="underline-offset-4 hover:underline">
                          #{h.order.number}
                        </Link>
                      )}
                    </span>
                    {h.note && <span className="truncate text-xs text-muted-foreground">{h.note}</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{t.date(h.at, { dateStyle: "short", timeStyle: "short" })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("store.lager.noHistory")}</p>
          )}
        </section>
      </div>
    </UrlSheet>
  )
}
