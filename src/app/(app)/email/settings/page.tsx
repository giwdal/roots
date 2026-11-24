import { DetailList } from "@/components/detail-list"
import { SendIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { EmailBodyField } from "@/components/email-body-field"
import { Notice } from "@/components/notice"
import { Page, PageHeader } from "@/components/page"
import { SaveBar } from "@/components/save-bar"
import { UrlSheet } from "@/components/url-sheet"
import { SubmitButton } from "@/components/submit-button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { builtInTemplate } from "@/email/event-mail"
import { EVENT_PLACEHOLDERS, type Format } from "@/email/render"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import type { Tables } from "@/lib/supabase/types"
import { param } from "@/lib/url"
import Link from "next/link"
import { ChevronRightIcon, PlugIcon } from "lucide-react"
import { AddLink, RowGroup } from "@/components/section"
import { copyBuiltInTemplate, deleteTemplate, saveTemplateAction, testTemplate } from "../actions"

// E-Mails › Einstellungen (the gear): E-Mail-Vorlagen for the mails events send on their own (tickets, guest-list
// tickets, waiting-list offers; one template fits all three, the default applies to every event that doesn't pick
// another one), where the shop buyer mails are set, and the email provider.
export default async function EmailSettingsPage({ searchParams }: PageProps<"/email/settings">) {
  const ctx = await requirePerm("email.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("email.manage")
  // Shop on: its buyer mails use the default template; their texts are edited in Shop → Einstellungen (linked here).
  const shop = ctx.modules.has("shop") && ctx.can("shop.manage")
  const { data } = await ctx.supabase.from("email_templates").select("*").eq("org_id", ctx.org.id).order("name")

  // roots' built-in mail is always the first row: what's sent while there's no own default, and the start for a copy.
  const builtIn = { id: "builtin", name: t("email.templates.builtIn"), ...builtInTemplate(t), is_default: !(data ?? []).some((x) => x.is_default) }
  const rows = [builtIn, ...(data ?? [])]
  const viewingBuiltIn = param(sp, "edit") === "builtin"
  const editing = (data ?? []).find((x) => x.id === param(sp, "edit"))
  const creating = canManage && param(sp, "new") === "1"
  return (
    <Page size="form">
      <PageHeader crumbs={[{ href: "/email", label: t("nav.emails") }, { label: t("email.settings.title") }]} title={t("email.settings.title")} />
      <Notice error={!editing && !creating ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <RowGroup id="templates" title={t("email.templates.title")} description={t("email.templates.hint")}>
        {rows.map((x) => (
          <Link key={x.id} href={`/email/settings?edit=${x.id}`} scroll={false} className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm hover:bg-muted active:bg-muted">
            <span className="grid min-w-0 flex-1">
              <span className="truncate font-medium">{x.name}</span>
              <span className="truncate text-xs text-muted-foreground">{x.subject}</span>
            </span>
            {x.is_default && <Badge variant="info">{t("email.templates.default")}</Badge>}
            <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </RowGroup>
      {canManage && <AddLink href="/email/settings?new=1">{t("email.templates.new")}</AddLink>}
      {shop && (
        <RowGroup id="shop" title={t("email.templates.shopMails")} description={t("email.templates.shopMailsHint")}>
          <Link href="/shop/settings#mails" className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted">
            {t("email.templates.shopMailsLink")}
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        </RowGroup>
      )}
      {ctx.can("org.integrations.manage") && (
        <RowGroup id="provider" title={t("email.settings.provider")} description={t("email.settings.providerHint")}>
          <Link href="/settings/integrations" className="flex min-h-12 items-center gap-3 px-4 py-3 text-sm hover:bg-muted">
            <PlugIcon className="size-4 text-muted-foreground" />
            <span className="flex-1">{t("email.settings.providerLink")}</span>
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </Link>
        </RowGroup>
      )}
      {viewingBuiltIn && (
        <UrlSheet params={["edit"]} title={builtIn.name} wide>
          <p className="text-sm text-muted-foreground">{t("email.templates.builtInHint")}</p>
          <DetailList items={[{ label: t("email.subject"), value: builtIn.subject }]} />
          <iframe title={t("email.preview")} sandbox="" srcDoc={builtIn.body} className="h-96 w-full rounded-lg border bg-white" />
          <Placeholders t={t} />
          {canManage && (
            <form action={copyBuiltInTemplate}>
              <SubmitButton>{t("email.templates.copy")}</SubmitButton>
            </form>
          )}
        </UrlSheet>
      )}
      {(editing || creating) && (
        <UrlSheet
          params={["edit", "new"]}
          title={editing?.name ?? t("email.templates.new")}
          wide
          menu={
            editing && canManage ? (
              <ActionsMenu>
                <MenuSubmit form="tpl-test" icon={<SendIcon />}>
                  {t("email.templates.test")}
                </MenuSubmit>
                <MenuSubmit form="tpl-delete" icon={<Trash2Icon />} destructive confirm="email.templates.confirmDelete">
                  {t("email.delete")}
                </MenuSubmit>
              </ActionsMenu>
            ) : undefined
          }
        >
          <Notice error={param(sp, "error")} />
          <TemplateForm t={t} x={editing} disabled={!canManage} />
          {editing && canManage && (
            <>
              <form id="tpl-test" action={testTemplate} hidden>
                <input type="hidden" name="id" value={editing.id} />
              </form>
              <form id="tpl-delete" action={deleteTemplate} hidden>
                <input type="hidden" name="id" value={editing.id} />
              </form>
            </>
          )}
        </UrlSheet>
      )}
    </Page>
  )
}

function TemplateForm({ t, x, disabled }: { t: T; x?: Tables<"email_templates">; disabled?: boolean }) {
  const key = x?.id ?? "new"
  const start = x ?? { ...builtInTemplate(t), name: "", is_default: false }
  return (
    <form action={saveTemplateAction} className="grid gap-4">
      {x && <input type="hidden" name="id" value={x.id} />}
      <fieldset disabled={disabled} className="grid gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`tpl-name-${key}`}>{t("email.name")}</Label>
          <Input id={`tpl-name-${key}`} name="name" required maxLength={200} defaultValue={start.name} placeholder={t("email.templates.namePlaceholder")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`tpl-subject-${key}`}>{t("email.subject")}</Label>
          <Input id={`tpl-subject-${key}`} name="subject" required maxLength={300} defaultValue={start.subject} />
        </div>
        <EmailBodyField id={`tpl-body-${key}`} format={start.format as Format} body={start.body} placeholders={EVENT_PLACEHOLDERS} disabled={disabled} />
        <p className="text-xs text-muted-foreground">{t("email.templates.placeholderHint")}</p>
        <Placeholders t={t} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_default" defaultChecked={start.is_default} className="size-4 accent-primary" /> {t("email.templates.makeDefault")}
        </label>
      </fieldset>
      {!disabled && <SaveBar label={x ? undefined : t("email.templates.create")} always={!x} />}
    </form>
  )
}

// Every placeholder with what it stands for (the editor's chips only show the names).
function Placeholders({ t }: { t: T }) {
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-medium">{t("email.templates.placeholders")}</summary>
      <DetailList
        className="mt-2"
        items={EVENT_PLACEHOLDERS.map((p) => ({
          label: <span className="font-mono text-xs text-foreground">{`{${p}}`}</span>,
          value: <span className="text-muted-foreground">{t.dynamic(`email.eventMail.vars.${p}`)}</span>,
        }))}
      />
    </details>
  )
}

export const instant = false
