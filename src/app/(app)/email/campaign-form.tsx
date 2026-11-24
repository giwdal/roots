import { FlaskConicalIcon } from "lucide-react"
import { DateInput } from "@/components/date-input"
import { EmailBodyField } from "@/components/email-body-field"
import { TitleTip } from "@/components/info-tip"
import { FormCard, RecordLayout } from "@/components/page"
import { RecordPicker, type PickerOption } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { SubmitButton } from "@/components/submit-button"
import { TagSelect } from "@/components/tag-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { BASE_PLACEHOLDERS, type Format } from "@/email/render"
import type { Audience } from "@/email/server"
import type { T } from "@/i18n/translate"
import { toLocalInput } from "@/lib/time"
import { saveCampaign, searchEvents } from "./actions"

export type CampaignDraft = { id: string | null; name: string; subject: string; body: string; format: string; audience: Audience; send_at: string | null }

/**
 * The campaign as one form (id "campaign"), read top to bottom like Mailchimp's checklist: Inhalt, Empfänger:innen,
 * Versand. Test and Planen submit this form with their intent; "Jetzt senden" sits in the page header (form="campaign").
 * Without an id it is the /email/new editor: the campaign exists after "Kampagne anlegen".
 */
export function CampaignForm({
  t,
  c,
  editable,
  tags,
  members,
  event,
  reach,
}: {
  t: T
  c: CampaignDraft
  editable: boolean
  tags: string[]
  members: boolean
  event: { on: boolean; initial: PickerOption | null }
  reach: number | null
}) {
  const key = c.id ?? "new"
  return (
    <form id="campaign" action={saveCampaign}>
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <RecordLayout
        aside={
          <>
            <FormCard id="audience" title={<TitleTip tip={t("email.audienceHint")}>{t("email.audience")}</TitleTip>} description={reach == null ? undefined : t("email.reach", { count: reach })}>
              <fieldset disabled={!editable} className="grid gap-4">
                <div className="grid gap-2">
                  <Label>{t("email.audienceTags")}</Label>
                  <TagSelect name="tags" options={tags} defaultValue={c.audience.tags ?? []} disabled={!editable} />
                </div>
                {members && (
                  <label className="flex min-h-8 items-center gap-2 text-sm">
                    <input type="checkbox" name="members" value="active" defaultChecked={c.audience.members === "active"} className="size-4 accent-primary" />
                    {t("email.audienceMembers")}
                  </label>
                )}
                {event.on && (
                  <div className="grid gap-2">
                    <RecordPicker name="event" label={t("email.audienceEvent")} search={searchEvents} initial={event.initial} placeholder={t("email.audienceEventPlaceholder")} disabled={!editable} />
                    <p className="text-xs text-muted-foreground">{t("email.audienceEventHint")}</p>
                  </div>
                )}
              </fieldset>
            </FormCard>
            {editable && c.id && (
              <FormCard id="send" title={t("email.sending")} description={t("email.sendingHint")}>
                <SubmitButton name="intent" value="test" variant="outline" size="sm" className="justify-self-start">
                  <FlaskConicalIcon /> {t("email.sendTest")}
                </SubmitButton>
                <div className="grid gap-2">
                  <Label htmlFor={`c-at-${key}`}>{t("email.sendAt")}</Label>
                  <div className="flex flex-wrap gap-2">
                    <DateInput id={`c-at-${key}`} name="send_at" type="datetime-local" defaultValue={c.send_at ? toLocalInput(c.send_at) : ""} className="w-auto flex-1" />
                    <SubmitButton name="intent" value="schedule" variant="outline" data-confirm="email.confirmSchedule" data-confirm-count={reach ?? 0}>
                      {t("email.schedule")}
                    </SubmitButton>
                  </div>
                </div>
              </FormCard>
            )}
          </>
        }
      >
        <FormCard id="content" title={t("email.content")}>
          <fieldset disabled={!editable} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`c-name-${key}`}>{t("email.name")}</Label>
                <Input id={`c-name-${key}`} name="name" defaultValue={c.name} required maxLength={200} placeholder={t("email.namePlaceholder")} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`c-subject-${key}`}>{t("email.subject")}</Label>
                <Input id={`c-subject-${key}`} name="subject" defaultValue={c.subject} maxLength={300} />
              </div>
            </div>
            <EmailBodyField id={`c-body-${key}`} format={c.format as Format} body={c.body} placeholders={BASE_PLACEHOLDERS} disabled={!editable} />
          </fieldset>
        </FormCard>
        {editable && (c.id ? <SaveBar /> : <SaveBar label={t("email.createCampaign")} always />)}
      </RecordLayout>
    </form>
  )
}
