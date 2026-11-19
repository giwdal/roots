import { Choice } from "@/components/choice"
import { FormCard, RecordLayout } from "@/components/page"
import { Notice } from "@/components/notice"
import { SaveBar } from "@/components/save-bar"
import { TagSelect } from "@/components/tag-select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CONTACT_INPUTS, MEMBERSHIP_INPUTS, type Element, type Purpose } from "@/forms/elements"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { param, siteUrl } from "@/lib/url"
import { saveForm } from "../actions"
import { ElementRows } from "./element-rows"
import { formHeader } from "./header"

// Aufbau: the form's elements (inline rows) and its settings in one form with one SaveBar, like Tally's builder.
export default async function FormBuilderPage({ params, searchParams }: PageProps<"/forms/[id]">) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requirePerm("forms.view")
  const t = await getT()
  const canManage = ctx.can("forms.manage")
  const [{ form, header }, defs, { data: tagRows }] = await Promise.all([formHeader(ctx, id, "builder"), loadFields(ctx.supabase, ctx.org.id, "contacts"), ctx.supabase.rpc("contact_tags", { p_org: ctx.org.id })])
  const purpose = form.purpose as Purpose
  const fields = [
    ...Object.entries(CONTACT_INPUTS).map(([k, v]) => ({ value: k, label: t.dynamic(v.label) })),
    ...defs.map((d) => ({ value: `custom.${d.key}`, label: d.label })),
    ...(purpose === "membership" ? Object.entries(MEMBERSHIP_INPUTS).map(([k, v]) => ({ value: k, label: t.dynamic(v.label) })) : []),
  ]
  const settings = form.settings as { tags?: string[] }
  const urlPrefix = siteUrl(ctx.org.slug, "/f/", ctx.org.site_domain).replace(/^https?:\/\//, "")

  return (
    <>
      {header}
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <form id="form-builder" action={saveForm}>
        <input type="hidden" name="id" value={form.id} />
        <RecordLayout
          aside={
            <FormCard id="form-settings" title={t("forms.settings")}>
              <fieldset disabled={!canManage} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="s-title">{t("forms.formTitle")}</Label>
                  <Input id="s-title" name="title" required maxLength={200} defaultValue={form.title} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-slug">{t("forms.slug")}</Label>
                  <Input id="s-slug" name="slug" required maxLength={80} defaultValue={form.slug} aria-describedby="s-slug-help" />
                  <p id="s-slug-help" className="truncate text-xs text-muted-foreground">
                    {urlPrefix}
                    {form.slug}
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-status">{t("forms.status")}</Label>
                  <Choice id="s-status" name="status" label={t("forms.status")} className="grid w-full grid-cols-3 [&>label]:justify-center [&>label]:px-1" required disabled={!canManage} defaultValue={form.status} options={(["draft", "published", "closed"] as const).map((x) => ({ value: x, label: t(`forms.statuses.${x}`) }))} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-intro">{t("forms.intro")}</Label>
                  <Textarea id="s-intro" name="intro" rows={3} maxLength={5000} defaultValue={form.intro ?? ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-success">{t("forms.successText")}</Label>
                  <Textarea id="s-success" name="success_text" rows={3} maxLength={2000} defaultValue={form.success_text ?? ""} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="s-tags">{t("forms.tags")}</Label>
                  <TagSelect id="s-tags" name="tags" options={(tagRows ?? []) as unknown as string[]} defaultValue={settings.tags ?? []} creatable disabled={!canManage} />
                  <p className="text-xs text-muted-foreground">{t("forms.tagsHelp")}</p>
                </div>
              </fieldset>
            </FormCard>
          }
        >
          <FormCard id="form-elements" title={t("forms.elements")} description={t(purpose === "membership" ? "forms.elementsHintMembership" : "forms.elementsHint")}>
            <ElementRows initial={form.elements as unknown as Element[]} fields={fields} membership={purpose === "membership"} disabled={!canManage} />
          </FormCard>
        </RecordLayout>
        {canManage && <SaveBar />}
      </form>
    </>
  )
}

export const instant = false
