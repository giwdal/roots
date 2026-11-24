import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"

// A run's state → colour (patterns.md §3): done = success, waiting / queued = warning, running = info, failed = red.
const TONE: Record<string, "success" | "warning" | "info" | "destructive" | "secondary"> = { done: "success", waiting: "warning", queued: "warning", running: "info", failed: "destructive", cancelled: "secondary" }

export function RunBadge({ t, status }: { t: T; status: string }) {
  return <Badge variant={TONE[status] ?? "secondary"}>{t.dynamic(`automations.runStatus.${status}`)}</Badge>
}
