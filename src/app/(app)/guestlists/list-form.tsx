import { DateInput } from "@/components/date-input"
import { FormCard } from "@/components/page"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import { toLocalInput } from "@/lib/time"
import type { Tables } from "@/lib/supabase/types"
import { priceInput } from "@/tickets/price"
import { saveList, searchListArtists, searchListEvents } from "./actions"

type Picked = { id: string; label: string; detail?: string } | null

/**
 * New / edit list, grouped: Liste (name, event, artist), Eintragen (door price, quota, names per link entry, link
 * closes), Notiz. The event is fixed once set (new page with ?event=, or editing); without one the picker searches the
 * org's events and empty = a permanent list. Event lists give every entry a free ticket.
 */
export function ListForm({ t, list, event, artist }: { t: T; list?: Tables<"guest_lists">; event: Picked | "pick"; artist: Picked }) {
  const fixed = event !== "pick"
  return (
    <form action={saveList} className="grid gap-6">
      {list && <input type="hidden" name="id" value={list.id} />}
      {fixed && <input type="hidden" name="event" value={event?.id ?? ""} />}
      <FormCard title={t("guestlists.listCard")}>
        <div className="grid gap-2">
          <Label htmlFor="gl-name">{t("guestlists.name")}</Label>
          <Input id="gl-name" name="name" defaultValue={list?.name} required maxLength={100} placeholder={t("guestlists.namePlaceholder")} />
        </div>
        {!fixed && (
          <div className="grid gap-2">
            <RecordPicker name="event" label={t("guestlists.event")} search={searchListEvents} placeholder={t("guestlists.permanentOption")} />
            <p className="text-xs text-muted-foreground">{t("guestlists.eventHint")}</p>
          </div>
        )}
        <RecordPicker name="artist" label={t("guestlists.artistOptional")} search={searchListArtists} initial={artist} placeholder="–" />
        {fixed && event && <p className="text-xs text-muted-foreground">{t("guestlists.autoTickets")}</p>}
      </FormCard>
      <FormCard title={t("guestlists.signupCard")}>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="gl-price">{t("guestlists.doorPriceLabel")}</Label>
            <TypedInput kind="money" id="gl-price" name="door_price" defaultValue={list?.door_price ? priceInput(list.door_price) : "0,00"} aria-describedby="gl-price-hint" />
            <p id="gl-price-hint" className="text-xs text-muted-foreground">
              {t("guestlists.doorPriceHint")}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gl-quota">{t("guestlists.quota")}</Label>
            <TypedInput kind="number" id="gl-quota" name="quota" min={1} step={1} defaultValue={list?.quota ?? ""} placeholder="∞" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gl-per">{t("guestlists.perSubmission")}</Label>
            <TypedInput kind="number" id="gl-per" name="per_submission" min={1} max={50} step={1} defaultValue={list?.per_submission ?? 5} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="gl-closes">{t("guestlists.closesAt")}</Label>
          <DateInput id="gl-closes" name="link_closes_at" type="datetime-local" defaultValue={list?.link_closes_at ? toLocalInput(list.link_closes_at) : undefined} />
        </div>
      </FormCard>
      <FormCard title={t("guestlists.notes")}>
        <Input id="gl-notes" name="notes" defaultValue={list?.notes ?? ""} maxLength={2000} aria-label={t("guestlists.notes")} />
      </FormCard>
      <SaveBar label={list ? undefined : t("guestlists.create")} always={!list} />
    </form>
  )
}
