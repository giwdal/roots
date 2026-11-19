import { notFound } from "next/navigation"
import { CircleSlashIcon, RotateCcwIcon, SendIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuExport, MenuSeparator, MenuSubmit } from "@/components/actions-menu"
import { CopyButton } from "@/components/copy-button"
import { PageHeader } from "@/components/page"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import type { requirePerm } from "@/lib/context"
import { siteUrl } from "@/lib/url"
import { setFormStatus, trashForm } from "../actions"
import { FormBadge } from "../badges"

/**
 * Header of a form's two sub-views (Aufbau · Einsendungen as <Segments>): status, purpose and the public link with a
 * copy button; ⋯ = close a live form (asks first), export submissions, trash (asks first). The status changes here:
 * a draft's next step "Veröffentlichen" saves the builder form and publishes it, a closed form's is "Wieder öffnen".
 * Returns the form row for the page.
 */
export async function formHeader(ctx: Awaited<ReturnType<typeof requirePerm>>, id: string, view: "builder" | "submissions") {
  const t = await getT()
  const canManage = ctx.can("forms.manage")
  const [{ data: form }, { count: fresh }] = await Promise.all([
    ctx.supabase.from("forms").select("*").eq("id", id).eq("org_id", ctx.org.id).is("deleted_at", null).maybeSingle(),
    ctx.supabase.from("form_submissions").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("form_id", id).eq("status", "new"),
  ])
  if (!form) notFound()
  const url = siteUrl(ctx.org.slug, `/f/${form.slug}`, ctx.org.site_domain)
  const live = form.status === "published"
  const header = (
    <>
      <PageHeader
        crumbs={[{ href: "/forms", label: t("forms.title") }, { label: form.title }]}
        title={form.title}
        badge={<FormBadge t={t} status={form.status} />}
        meta={
          <>
            <span>{t.dynamic(`forms.purposes.${form.purpose}`)}</span>
            {live && (
              <>
                <span aria-hidden className="max-sm:hidden">
                  ·
                </span>
                <a href={url} target="_blank" rel="noreferrer" className="link min-w-0 truncate">
                  {url.replace(/^https?:\/\//, "")}
                </a>
                <CopyButton value={url} label={t("forms.copyLink")} />
              </>
            )}
          </>
        }
        menu={
          <ActionsMenu>
            {canManage && live && (
              <MenuSubmit form="close-form" icon={<CircleSlashIcon />} confirm="forms.confirmClose">
                {t("forms.closeForm")}
              </MenuSubmit>
            )}
            <MenuExport entity="submissions" query={{ form: id }} label={t("forms.exportSubmissions")} />
            {canManage && (
              <>
                <MenuSeparator />
                <MenuSubmit form="trash-form" icon={<Trash2Icon />} destructive confirm="forms.confirmTrash">
                  {t("forms.toTrash")}
                </MenuSubmit>
              </>
            )}
          </ActionsMenu>
        }
        primary={
          canManage && view === "builder" && form.status === "draft" ? (
            <SubmitButton size="sm" form="form-builder" name="publish" value="1">
              <SendIcon /> {t("forms.publish")}
            </SubmitButton>
          ) : canManage && form.status === "closed" ? (
            <SubmitButton size="sm" form="reopen-form">
              <RotateCcwIcon /> {t("forms.reopenForm")}
            </SubmitButton>
          ) : undefined
        }
      />
      {canManage && (
        <>
          <form id="trash-form" action={trashForm} hidden>
            <input type="hidden" name="id" value={form.id} />
          </form>
          <form id={live ? "close-form" : "reopen-form"} action={setFormStatus} hidden>
            <input type="hidden" name="id" value={form.id} />
            <input type="hidden" name="status" value={live ? "closed" : "published"} />
          </form>
        </>
      )}
      <Segments
        label={form.title}
        className="justify-self-start"
        items={[
          { href: `/forms/${id}`, label: t("forms.tabs.builder"), current: view === "builder" },
          { href: `/forms/${id}/submissions`, label: fresh ? t("forms.tabs.submissionsNew", { count: fresh }) : t("forms.tabs.submissions"), current: view === "submissions" },
        ]}
      />
    </>
  )
  return { form, header, fresh: fresh ?? 0 }
}
