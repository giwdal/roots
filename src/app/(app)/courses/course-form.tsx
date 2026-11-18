import { Choice } from "@/components/choice"
import { DateInput } from "@/components/date-input"
import { FormCard } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import { saveCourse } from "./actions"

/**
 * A new course: details, then optionally its first date (open and pre-filled when the calendar sent a day). More
 * dates follow on the course page; afterwards every detail is edited in place there (patchCourse).
 */
export function CourseForm({ t, locations, first }: { t: T; locations: { id: string; name: string }[]; first?: { start: string; end: string } | null }) {
  return (
    <form action={saveCourse} className="grid gap-6">
      <FormCard id="details" title={t("courses.details")}>
        <div className="grid gap-2">
          <Label htmlFor="c-title">{t("courses.titleLabel")}</Label>
          <Input id="c-title" name="title" required maxLength={200} placeholder={t("courses.titlePlaceholder")} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="c-instructor">{t("courses.instructor")}</Label>
            <Input id="c-instructor" name="instructor" maxLength={200} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="c-capacity">{t("courses.capacity")}</Label>
            <TypedInput kind="number" id="c-capacity" name="capacity" min={1} max={10000} placeholder={t("courses.unlimited")} />
          </div>
          {locations.length > 0 && (
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="c-location">{t("courses.location")}</Label>
              <Choice id="c-location" name="location_id" label={t("courses.location")} options={locations.map((l) => ({ value: l.id, label: l.name }))} />
            </div>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="c-description">{t("courses.description")}</Label>
          <Textarea id="c-description" name="description" rows={3} maxLength={5000} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="track_attendance" value="1" defaultChecked className="size-4 accent-primary" />
          {t("courses.trackAttendance")}
        </label>
      </FormCard>
      <details open={!!first} className="group grid gap-4 rounded-xl border p-4 [&>summary]:list-none">
        <summary className="cursor-pointer text-sm font-medium">{t("courses.firstDate")}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="c-start">{t("courses.start")}</Label>
            <DateInput id="c-start" name="starts_at" type="datetime-local" defaultValue={first?.start ?? ""} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="c-end">{t("courses.end")}</Label>
            <DateInput id="c-end" name="ends_at" type="datetime-local" defaultValue={first?.end ?? ""} />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("courses.firstDateHint")}</p>
      </details>
      <SaveBar label={t("courses.create")} always />
    </form>
  )
}
