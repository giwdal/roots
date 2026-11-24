import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"

type Variant = "success" | "warning" | "info" | "destructive" | "secondary" | "outline"

// Status colours (docs/design/patterns.md §3): done = success, waiting = warning, scheduled / in progress = info.
const CAMPAIGN: Record<string, Variant> = { draft: "secondary", scheduled: "info", sending: "warning", sent: "success" }
const SEND: Record<string, Variant> = { sent: "success", queued: "warning", sending: "info", failed: "destructive", skipped: "secondary" }

/** A campaign's state (Entwurf, Geplant · date, Wird versendet, Versendet). */
export function CampaignBadge({ t, status, sendAt }: { t: T; status: string; sendAt?: string | null }) {
  return (
    <Badge variant={CAMPAIGN[status] ?? "secondary"}>
      {t.dynamic(`email.statuses.${status}`)}
      {status === "scheduled" && sendAt ? ` · ${t.date(sendAt, { dateStyle: "short", timeStyle: "short" })}` : ""}
    </Badge>
  )
}

/** One mail of the send log (Versendet, Wartet, Fehlgeschlagen …). */
export function SendBadge({ t, status }: { t: T; status: string }) {
  return <Badge variant={SEND[status] ?? "secondary"}>{t.dynamic(`email.sendStatus.${status}`)}</Badge>
}
