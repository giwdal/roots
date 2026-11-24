import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"
import { rentalState } from "@/rentals/fields"

const STATE_VARIANT = { running: "success", upcoming: "info", request: "warning", cancelled: "secondary", ended: "secondary" } as const

/** Where a rental stands, in its status colour (Läuft, Kommend, Anfrage, Storniert, Beendet). */
export function StateBadge({ t, r }: { t: T; r: Parameters<typeof rentalState>[0] }) {
  const s = rentalState(r)
  return <Badge variant={STATE_VARIANT[s]}>{t.dynamic(`rentals.states.${s}`)}</Badge>
}

/** An object right now: Frei, Vergeben, or out of use (Inaktiv, Verloren). */
export function ObjectBadge({ t, status, busy }: { t: T; status: string; busy: boolean }) {
  if (status === "lost") return <Badge variant="destructive">{t("rentals.statuses.lost")}</Badge>
  if (status !== "active") return <Badge variant="secondary">{t.dynamic(`rentals.statuses.${status}`)}</Badge>
  return busy ? <Badge variant="info">{t("rentals.busy")}</Badge> : <Badge variant="success">{t("rentals.free")}</Badge>
}
