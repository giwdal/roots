import { redirect } from "next/navigation"
import { ContactIcon, IdCardIcon } from "lucide-react"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE } from "@/components/data-table"
import { DetailList } from "@/components/detail-list"
import { LinkRows } from "@/components/link-rows"
import { Notice } from "@/components/notice"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { CONTACT_INPUTS, type Submission } from "@/forms/elements"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { loadFields } from "@/lib/custom-fields"
import { pageParam, param, withParams } from "@/lib/url"
import { acceptSubmission, rejectSubmission } from "../../actions"
import { SubmissionBadge } from "../../badges"
import { formHeader } from "../header"

const STATUSES = ["new", "accepted", "rejected", "all"] as const

// Einsendungen: an inbox. Opens on "Neu" while there are new ones; a submission opens in a sheet with every answer by
// its label, the linked contact / membership and Annehmen · Ablehnen (both ask first).
export default async function SubmissionsPage({ params, searchParams }: PageProps<"/forms/[id]/submissions">) {
  const { id } = await params
  const sp = await searchParams
  const ctx = await requirePerm("forms.view")
  const t = await getT()
  const canManage = ctx.can("forms.manage")
  const page = pageParam(sp)
  const openId = param(sp, "sub")
  if (openId) redirect(`/forms/${id}/submissions${withParams(sp, { sub: undefined, edit: openId })}`) // old sheet param
  const editId = param(sp, "edit")
  const here = `/forms/${id}/submissions`

  const [{ form, header, fresh }, defs, { data: open }] = await Promise.all([
    formHeader(ctx, id, "submissions"),
    loadFields(ctx.supabase, ctx.org.id, "contacts"),
    editId ? ctx.supabase.from("form_submissions").select("*").eq("id", editId).eq("org_id", ctx.org.id).eq("form_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const status = STATUSES.find((s) => s === param(sp, "status")) ?? (fresh ? "new" : "all")
  let query = ctx.supabase
    .from("form_submissions")
    .select("id, email, status, created_at, data")
    .eq("org_id", ctx.org.id)
    .eq("form_id", id)
    .order("created_at", { ascending: false })
    .range(...pageRange(page))
  if (status !== "all") query = query.eq("status", status)
  const [{ data }, { data: types }] = await Promise.all([
    query,
    form.purpose === "membership" && open ? ctx.supabase.from("membership_types").select("id, name").eq("org_id", ctx.org.id) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  const name = (d: unknown) => {
    const c = (d as Submission).contact
    return [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.company || c?.email || "–"
  }
  const sub = open ? { ...open, data: open.data as unknown as Submission } : null
  const membership = form.purpose === "membership"
  const linked = sub
    ? [
        sub.contact_id && ctx.can("crm.view") && { key: "contact", href: `/contacts/${sub.contact_id}`, icon: ContactIcon, title: t("forms.openContact"), detail: name(sub.data) },
        sub.membership_id && ctx.can("members.view") && { key: "membership", href: `/members/${sub.membership_id}`, icon: IdCardIcon, title: t("forms.openMembership") },
      ].filter((x) => !!x)
    : []
  const decide = sub && canManage && sub.status === "new" && (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <form action={rejectSubmission} className="grid">
        <input type="hidden" name="id" value={sub.id} />
        <input type="hidden" name="back" value={`${here}?edit=${sub.id}`} />
        <SubmitButton variant="outline" data-confirm="forms.confirmReject">
          {t("forms.reject")}
        </SubmitButton>
      </form>
      <form action={acceptSubmission} className="grid">
        <input type="hidden" name="id" value={sub.id} />
        <input type="hidden" name="back" value={`${here}?edit=${sub.id}`} />
        <SubmitButton data-confirm={membership ? "forms.confirmAcceptMember" : "forms.confirmAccept"}>{t(membership ? "forms.acceptMember" : "forms.accept")}</SubmitButton>
      </form>
    </div>
  )

  return (
    <>
      {header}
      <Notice error={!editId ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      <ListToolbar>
        <Segments
          label={t("forms.status")}
          className="justify-self-start"
          items={STATUSES.map((s) => ({ href: withParams(sp, { status: s, page: undefined, edit: undefined }), current: s === status, label: s === "all" ? t("forms.all") : t(`forms.subStatus.${s}`) }))}
        />
      </ListToolbar>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => withParams(sp, { edit: r.id })}
        empty={status === "new" ? t("forms.noNewSubmissions") : t("forms.noSubmissions")}
        columns={[
          { header: t("forms.person"), cell: (r) => <span className="font-medium">{name(r.data)}</span> },
          { header: t("contacts.email"), cell: (r) => <span className="break-all">{r.email}</span> },
          { header: t("forms.received"), cell: (r) => t.date(r.created_at, { dateStyle: "medium", timeStyle: "short" }), className: "whitespace-nowrap" },
          { header: t("forms.status"), cell: (r) => <SubmissionBadge t={t} status={r.status} /> },
        ]}
      />
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {sub && (
        <UrlSheet
          params={["edit"]}
          title={name(sub.data)}
          meta={
            <span className="flex flex-wrap items-center gap-2">
              <SubmissionBadge t={t} status={sub.status} />
              {t.date(sub.created_at, { dateStyle: "full", timeStyle: "short" })}
            </span>
          }
        >
          <Notice error={param(sp, "error")} />
          {linked.length > 0 && <LinkRows rows={linked} />}
          <DetailList
            items={[
              ...Object.entries(sub.data.contact ?? {})
                .filter(([, v]) => v)
                .map(([k, v]) => row(CONTACT_INPUTS[k] ? t.dynamic(CONTACT_INPUTS[k].label) : k, String(v))),
              ...Object.entries(sub.data.custom ?? {}).map(([k, v]) => row(defs.find((d) => d.key === k)?.label ?? k, String(v))),
              ...(sub.data.membership
                ? [
                    row(t("forms.fields.membershipType"), types?.find((x) => x.id === sub.data.membership!.type_id)?.name ?? "–"),
                    sub.data.membership.starts_on && row(t("forms.fields.startsOn"), t.date(sub.data.membership.starts_on)),
                    sub.data.membership.iban && row("IBAN", sub.data.membership.iban),
                    sub.data.membership.account_holder && row(t("forms.accountHolder"), sub.data.membership.account_holder),
                  ]
                : []),
              ...(sub.data.consents ?? []).map((c) => row(c.accepted ? "✓" : "✗", c.label)),
            ]}
          />
          {decide}
        </UrlSheet>
      )}
    </>
  )
}

function row(label: string, value: string) {
  return { label, value: <span className="whitespace-pre-line">{value}</span> }
}

export const instant = false
