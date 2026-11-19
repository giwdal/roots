import { DataTable } from "@/components/data-table"
import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"

export const LIST_COLS = "id, name, event_id, door_price, quota, link_enabled, ticket_type_id, events(title, starts_at), artists(name), guest_entries(count)"
type Row = { id: string; name: string; event_id: string | null; door_price: number | null; quota: number | null; link_enabled: boolean; events: { title: string; starts_at: string } | null; artists: { name: string } | null; guest_entries: unknown }

/** Guest lists as a table (overview, and the event's "Gästelisten" tab without the event column). */
export function GuestListTable({ t, rows, withEvent = true, empty, action }: { t: T; rows: Row[]; withEvent?: boolean; empty: React.ReactNode; action?: (l: Row) => React.ReactNode }) {
  const count = (l: Row) => (l.guest_entries as { count: number }[])[0]?.count ?? 0
  return (
    <DataTable
      rows={rows}
      rowKey={(l) => l.id}
      rowHref={action ? undefined : (l) => `/guestlists/${l.id}`}
      empty={empty}
      columns={[
        {
          header: t("guestlists.name"),
          cell: (l) => (
            <span className="grid min-w-0">
              <span className="font-medium">{l.name}</span>
              {/* Muted line: the artist, and (in an event's tab) that the list is a permanent one. */}
              {(l.artists?.name || (!withEvent && !l.event_id)) && (
                <span className="truncate text-xs text-muted-foreground">{[l.artists?.name, !withEvent && !l.event_id && t("guestlists.permanent")].filter(Boolean).join(" · ")}</span>
              )}
            </span>
          ),
        },
        ...(withEvent
          ? [{ header: t("guestlists.event"), cell: (l: Row) => (l.events ? `${l.events.title} · ${t.date(l.events.starts_at, { dateStyle: "short" })}` : <Badge variant="secondary">{t("guestlists.permanent")}</Badge>) }]
          : []),
        { header: t("guestlists.entries"), cell: (l) => `${count(l)}${l.quota ? ` / ${l.quota}` : ""}`, className: "text-right tabular-nums" },
        { header: t("guestlists.doorPrice"), cell: (l) => (l.door_price ? t.money(l.door_price) : t("guestlists.free")), className: "text-right tabular-nums" },
        action
          ? { header: "", cell: action }
          : { header: t("guestlists.link"), cell: (l: Row) => (l.link_enabled ? <Badge variant="success">{t("guestlists.linkOn")}</Badge> : null) },
      ]}
    />
  )
}
