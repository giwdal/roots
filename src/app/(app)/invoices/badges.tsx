import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"

type Variant = "success" | "warning" | "info" | "destructive" | "secondary" | "outline"
type Doc = { kind: string; status: string; due_date?: string | null }

// Status colours (docs/design/patterns.md §3): draft = secondary, waiting for money/answer = warning, done = success,
// overdue = destructive, closed without money (cancelled, declined, a Storno) = outline.
const DOC: Record<string, Variant> = {
  draft: "secondary",
  sent: "warning",
  paid: "success",
  accepted: "success",
  declined: "outline",
  cancelled: "outline",
}

/** An invoice that is issued, unpaid and past its due date (Berlin day `today`, YYYY-MM-DD). */
export const isOverdue = (d: Doc, today: string) => d.kind === "invoice" && d.status === "sent" && !!d.due_date && d.due_date < today

export function DocBadge({ t, doc, today }: { t: T; doc: Doc; today: string }) {
  if (isOverdue(doc, today)) return <Badge variant="destructive">{t("invoices.filters.overdue")}</Badge>
  const variant = doc.kind === "cancellation" ? (doc.status === "draft" ? "secondary" : "outline") : (DOC[doc.status] ?? "secondary")
  return <Badge variant={variant}>{t.dynamic(`invoices.statuses.${doc.kind}.${doc.status}`)}</Badge>
}
