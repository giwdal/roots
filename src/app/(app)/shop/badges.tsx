import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"

type Variant = "success" | "warning" | "info" | "destructive" | "secondary" | "outline"

// Status colours (docs/design/patterns.md §3): done = success, waiting = warning, in progress = info, problem = destructive.
const ORDER: Record<string, Variant> = { new: "warning", ready: "info", shipped: "info", completed: "success", cancelled: "destructive" }
const PAY: Record<string, Variant> = { paid: "success", partially_refunded: "info", refunded: "info", open: "warning", failed: "destructive", expired: "destructive", cancelled: "secondary" }
const PRODUCT: Record<string, Variant> = { published: "success", draft: "secondary", archived: "outline" }

/** Fulfilment state of a shop order (Zu bearbeiten, Abholbereit, Versendet, Erledigt, Storniert). */
export function OrderBadge({ t, status }: { t: T; status: string }) {
  return <Badge variant={ORDER[status] ?? "secondary"}>{t.dynamic(`store.orderStatus.${status}`)}</Badge>
}

/** Payment state of the order behind a shop order (bezahlt, offen, erstattet …). */
export function PayBadge({ t, status }: { t: T; status: string }) {
  return <Badge variant={PAY[status] ?? "secondary"}>{t.dynamic(`store.payStatus.${status}`)}</Badge>
}

/** A product's state in the shop (Im Shop, Entwurf, Archiviert). */
export function ProductBadge({ t, status }: { t: T; status: string }) {
  return <Badge variant={PRODUCT[status] ?? "secondary"}>{t.dynamic(`store.statuses.${status}`)}</Badge>
}

export const isPaid = (status: string) => status === "paid" || status === "partially_refunded"
