import Link from "next/link"
import { ChevronRightIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Choice } from "@/components/choice"
import { Notice } from "@/components/notice"
import { SaveBar } from "@/components/save-bar"
import { AddLink, RowGroup } from "@/components/section"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import type { T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { CUSTOM_ENTITIES, FIELD_TYPES, type CustomEntity } from "@/lib/custom-fields"
import type { Tables } from "@/lib/supabase/types"
import { param, withParams } from "@/lib/url"
import { createField, deleteField, updateField } from "./actions"
import { OptionRows } from "./option-rows"

type Field = Tables<"custom_fields">

// Organisation › Felder: org-defined extra fields, one group per kind of record (only modules that are on). A row opens
// its sheet (?edit=<id>), "+ Neues Feld" at the end of each group (?new=<entity>).
export default async function FieldsPage({ searchParams }: PageProps<"/settings/fields">) {
  const ctx = await requirePerm("org.settings.manage")
  const t = await getT()
  const sp = await searchParams
  const entities = (Object.keys(CUSTOM_ENTITIES) as CustomEntity[]).filter((e) => ctx.modules.has(CUSTOM_ENTITIES[e].module))
  const { data } = await ctx.supabase.from("custom_fields").select("*").eq("org_id", ctx.org.id).order("position").order("created_at")
  const fields = data ?? []
  const newFor = entities.find((e) => e === param(sp, "new"))
  const editing = fields.find((f) => f.id === param(sp, "edit"))

  return (
    <div className="grid gap-8">
      <p className="px-1 text-sm text-muted-foreground">{t("fields.intro")}</p>
      <Notice error={!newFor && !editing ? param(sp, "error") : undefined} ok={param(sp, "ok")} />
      {!entities.length && <p className="rounded-lg border px-4 py-8 text-center text-sm text-muted-foreground">{t("fields.noEntities")}</p>}
      {entities.map((e) => (
        <RowGroup key={e} id={`fields-${e}`} title={t.dynamic(`fields.entities.${e}`)}>
          {fields
            .filter((f) => f.entity === e)
            .map((f) => (
              <Link key={f.id} href={withParams(sp, { edit: f.id, new: undefined })} scroll={false} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm hover:bg-muted active:bg-muted">
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{f.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{[t.dynamic(`fields.types.${f.type}`), f.options.join(", ")].filter(Boolean).join(" · ")}</span>
                </span>
                {f.required && <Badge variant="secondary">{t("fields.requiredYes")}</Badge>}
                <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
          <div className="px-4 py-2">
            <AddLink href={withParams(sp, { new: e, edit: undefined })}>{t("fields.new")}</AddLink>
          </div>
        </RowGroup>
      ))}

      {newFor && (
        <UrlSheet params={["new"]} title={`${t("fields.new")} · ${t.dynamic(`fields.entities.${newFor}`)}`}>
          <Notice error={param(sp, "error")} />
          <FieldForm t={t} action={createField} entity={newFor} />
        </UrlSheet>
      )}
      {editing && (
        <UrlSheet
          params={["edit"]}
          title={editing.label}
          description={t.dynamic(`fields.types.${editing.type}`)}
          menu={
            <ActionsMenu>
              <MenuSubmit form="delete-field" icon={<Trash2Icon />} destructive confirm="fields.confirmDelete">
                {t("fields.delete")}
              </MenuSubmit>
            </ActionsMenu>
          }
        >
          <Notice error={param(sp, "error")} />
          <form id="delete-field" action={deleteField} hidden>
            <input type="hidden" name="id" value={editing.id} />
          </form>
          <FieldForm t={t} action={updateField} field={editing} />
        </UrlSheet>
      )}
    </div>
  )
}

// One form for new and existing fields. The options only show while the type is "Auswahl" (CSS :has on the type).
function FieldForm({ t, action, entity, field }: { t: T; action: (fd: FormData) => Promise<void>; entity?: string; field?: Field }) {
  return (
    <form action={action} className="group/field grid gap-4">
      {field && <input type="hidden" name="id" value={field.id} />}
      {entity && <input type="hidden" name="entity" value={entity} />}
      <div className="grid max-w-xl gap-2">
        <Label htmlFor="f-label">{t("fields.label")}</Label>
        <Input id="f-label" name="label" defaultValue={field?.label} required maxLength={100} />
      </div>
      {!field && (
        <div className="grid gap-2">
          <Label htmlFor="f-type">{t("fields.type")}</Label>
          <Choice id="f-type" name="type" label={t("fields.type")} required defaultValue="text" options={FIELD_TYPES.map((ty) => ({ value: ty, label: t.dynamic(`fields.types.${ty}`) }))} />
          <p className="text-xs text-muted-foreground">{t("fields.typeFixed")}</p>
        </div>
      )}
      {(!field || field.type === "select") && (
        <div className={field ? "grid gap-4" : "hidden gap-4 group-has-[option[value=select]:checked]/field:grid"}>
          <OptionRows defaultOptions={field?.options ?? []} colors={(field?.option_colors ?? {}) as Record<string, string>} />
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="required" value="1" defaultChecked={field?.required} className="size-4 accent-primary" />
        {t("fields.requiredLabel")}
      </label>
      <SaveBar label={field ? undefined : t("fields.new")} always={!field} />
    </form>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
