import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"

type Variant = "success" | "warning" | "info" | "destructive" | "secondary"

// One colour per payment state (orders, provider payments, refunds): money in = success, waiting = warning,
// money back = info, failed = destructive.
const PAY: Record<string, Variant> = {
  paid: "success",
  succeeded: "success",
  open: "warning",
  pending: "warning",
  refunded: "info",
  partially_refunded: "info",
  failed: "destructive",
  expired: "destructive",
  cancelled: "secondary",
}

export function PayStatusBadge({ t, status }: { t: T; status: string }) {
  return <Badge variant={PAY[status] ?? "secondary"}>{t.dynamic(`payments.statuses.${status}`)}</Badge>
}
