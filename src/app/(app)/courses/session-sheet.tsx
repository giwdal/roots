import { Trash2Icon, XIcon, CheckIcon } from "lucide-react"
import { ActionsMenu, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { DateInput } from "@/components/date-input"
import { Notice } from "@/components/notice"
import { SaveBar } from "@/components/save-bar"
import { UrlSheet } from "@/components/url-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import { toLocalInput } from "@/lib/time"
import { deleteSession, setSessionCancelled, updateSession } from "./actions"

type Session = { id: string; course_id: string; starts_at: string; ends_at: string; note: string | null; cancelled: boolean }
type From = "course" | "session"

/** A date's long name: "Montag, 3. November, 18:00–19:30". */
export const sessionTitle = (t: T, s: { starts_at: string; ends_at: string }) =>
  `${t.date(s.starts_at, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}–${t.date(s.ends_at, { hour: "2-digit", minute: "2-digit" })}`

/** Hidden forms behind a date's ⋯ items (fällt aus / findet statt, löschen), posted by MenuSubmit form=… */
export function SessionForms({ s, from }: { s: Session; from: From }) {
  return (
    <>
      <form id={`session-cancel-${s.id}`} action={setSessionCancelled} hidden>
        <input type="hidden" name="id" value={s.id} />
        <input type="hidden" name="course_id" value={s.course_id} />
        <input type="hidden" name="cancelled" value={s.cancelled ? "0" : "1"} />
        <input type="hidden" name="from" value={from} />
      </form>
      <form id={`session-delete-${s.id}`} action={deleteSession} hidden>
        <input type="hidden" name="id" value={s.id} />
        <input type="hidden" name="course_id" value={s.course_id} />
      </form>
    </>
  )
}

/** The ⋯ items of a date: it doesn't take place (asks) / takes place again, delete (asks). */
export function SessionMenuItems({ t, s }: { t: T; s: Session }) {
  return (
    <>
      <MenuSubmit form={`session-cancel-${s.id}`} icon={s.cancelled ? <CheckIcon /> : <XIcon />} confirm={s.cancelled ? undefined : "courses.confirmCancelDate"}>
        {s.cancelled ? t("courses.resumeDate") : t("courses.cancelDate")}
      </MenuSubmit>
      <MenuSeparator />
      <MenuSubmit form={`session-delete-${s.id}`} icon={<Trash2Icon />} destructive confirm="courses.confirmDeleteDate">
        {t("courses.deleteDate")}
      </MenuSubmit>
    </>
  )
}

/**
 * One date's own fields (time, note) as a sheet: on the course page (?edit=<id>, courses without attendance) and on
 * the date's page (?edit=date). Whether it takes place and deleting are ⋯ actions that ask first.
 */
export function SessionSheet({ t, s, from, param, error, canManage }: { t: T; s: Session; from: From; param: string; error?: string; canManage: boolean }) {
  return (
    <UrlSheet
      params={[param]}
      title={sessionTitle(t, s)}
      meta={s.cancelled ? t("courses.dateIsCancelled") : undefined}
      compact
      menu={
        canManage &&
        from === "course" && (
          <ActionsMenu>
            <SessionMenuItems t={t} s={s} />
          </ActionsMenu>
        )
      }
    >
      <Notice error={error} />
      {from === "course" && canManage && <SessionForms s={s} from={from} />}
      <form action={updateSession} className="grid gap-4">
        <input type="hidden" name="id" value={s.id} />
        <input type="hidden" name="course_id" value={s.course_id} />
        <input type="hidden" name="from" value={from} />
        <fieldset disabled={!canManage} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="d-start">{t("courses.start")}</Label>
              <DateInput id="d-start" name="starts_at" type="datetime-local" required defaultValue={toLocalInput(s.starts_at)} />
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="d-end">{t("courses.end")}</Label>
              <DateInput id="d-end" name="ends_at" type="datetime-local" required defaultValue={toLocalInput(s.ends_at)} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="d-note">{t("courses.noteOptional")}</Label>
            <Input id="d-note" name="note" maxLength={500} defaultValue={s.note ?? ""} placeholder={t("courses.dateNotePlaceholder")} />
          </div>
        </fieldset>
        {canManage && <SaveBar />}
      </form>
    </UrlSheet>
  )
}
