import { redirect } from "next/navigation"
import { param } from "@/lib/url"

// The Lager is the "Bestand" view of Produkte now; old links (?item=<id>) open the same booking sheet there.
export default async function StockPage({ searchParams }: PageProps<"/shop/stock">) {
  const sp = await searchParams
  const item = param(sp, "item")
  redirect(`/shop?view=stock${item ? `&edit=${encodeURIComponent(item)}` : ""}`)
}
