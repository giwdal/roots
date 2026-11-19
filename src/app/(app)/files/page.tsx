import Link from "next/link"
import { BulkBar } from "@/components/bulk-bar"
import { ArchiveRestoreIcon, DownloadIcon, ExternalLinkIcon, FileIcon, FileTextIcon, FolderIcon, ImageIcon, Trash2Icon } from "lucide-react"
import { ActionsMenu, MenuLink, MenuSubmit } from "@/components/actions-menu"
import { FilterMenu } from "@/components/filter-menu"
import { EmptyState, Page, PageHeader } from "@/components/page"
import { DataTable, ListToolbar, Pager, pageRange, PAGE_SIZE, SearchBox } from "@/components/data-table"
import { DetailList } from "@/components/detail-list"
import { FileDrop, FileUpload } from "@/components/file-upload"
import { Notice } from "@/components/notice"
import { SaveBar } from "@/components/save-bar"
import { Segments } from "@/components/segments"
import { SubmitButton } from "@/components/submit-button"
import { UrlSheet } from "@/components/url-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getT } from "@/i18n/server"
import { requirePerm } from "@/lib/context"
import { fileSize } from "@/lib/files"
import { pageParam, param, withParams } from "@/lib/url"
import { bulkTrashFiles, restoreFile, trashFile, updateFile } from "./actions"

// Records a file can be attached to → where that record opens ("Zu <Record>" in the file's sheet).
const RECORD_LINKS: Record<string, (id: string) => string> = {
  contacts: (id) => `/contacts/${id}`,
  events: (id) => `/events/${id}`,
  memberships: (id) => `/members/${id}`,
  courses: (id) => `/courses/${id}`,
  employees: (id) => `/hr/${id}`,
  products: (id) => `/shop/${id}`,
  projects: (id) => `/projects/${id}`,
  tasks: (id) => `/projects/tasks?task=${id}`,
  rentals: (id) => `/rentals/r/${id}`,
  rental_objects: (id) => `/rentals/${id}`,
  cash_entries: (id) => `/cashbook?edit=${id}`,
  documents: (id) => `/invoices/${id}`,
  wiki_pages: (id) => `/wiki/${id}`,
}
const isImage = (mime: string | null) => !!mime?.startsWith("image/")

// Dateien (Google Drive / Dropbox): folders as a filter, search, list or tiles (?view=grid, pictures as thumbnails),
// drop files onto the list to upload into the open folder; a file opens a sheet with a preview, its record, name and
// folder; trash ?trash=1 with restore.
export default async function FilesPage({ searchParams }: PageProps<"/files">) {
  const ctx = await requirePerm("org.files.view")
  const t = await getT()
  const sp = await searchParams
  const canManage = ctx.can("org.files.manage")
  const q = param(sp, "q")?.replace(/[%,()*]/g, "").trim()
  const folder = param(sp, "folder")
  const trash = canManage && param(sp, "trash") === "1"
  const grid = param(sp, "view") === "grid"
  const page = pageParam(sp)
  const editId = param(sp, "edit")
  const uploading = canManage && !trash && param(sp, "new") === "upload"

  let query = ctx.supabase
    .from("files")
    .select("id, name, size, mime, path, folder, entity, entity_id, created_at, deleted_at")
    .eq("org_id", ctx.org.id)
    .range(...pageRange(page))
  query = trash ? query.not("deleted_at", "is", null).order("deleted_at", { ascending: false }) : query.is("deleted_at", null).order("created_at", { ascending: false })
  if (q) query = query.ilike("name", `%${q}%`)
  if (folder && !trash) query = query.eq("folder", folder)
  const [{ data }, { data: folderRows }, { data: editing }] = await Promise.all([
    query,
    // ponytail: folder chips from the first 2000 files; a distinct RPC once orgs have more.
    ctx.supabase.from("files").select("folder").eq("org_id", ctx.org.id).is("deleted_at", null).not("folder", "is", null).limit(2000),
    editId ? ctx.supabase.from("files").select("*").eq("id", editId).eq("org_id", ctx.org.id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const rows = data?.slice(0, PAGE_SIZE) ?? []
  // Thumbnails (tiles) and the sheet's preview: short signed links, all in one call.
  const pictures = [...(grid ? rows.filter((r) => isImage(r.mime)) : []), ...(editing && isImage(editing.mime) ? [editing] : [])].map((r) => r.path)
  const { data: signed } = pictures.length ? await ctx.supabase.storage.from("files").createSignedUrls([...new Set(pictures)], 600) : { data: null }
  const thumb = (path: string) => signed?.find((s) => s.path === path)?.signedUrl ?? undefined
  const folders = [...new Set(folderRows?.map((r) => r.folder!))].sort((a, b) => a.localeCompare(b, t.locale))
  const attached = (entity: string | null) => (entity ? (t.has(`files.entities.${entity}`) ? t.dynamic(`files.entities.${entity}`) : entity) : "")
  const Icon = (mime: string | null) => (isImage(mime) ? ImageIcon : mime === "application/pdf" ? FileTextIcon : FileIcon)
  const empty = trash ? (
    <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("files.emptyTrash")}</p>
  ) : q || folder ? (
    <p className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">{t("files.noMatch")}</p>
  ) : (
    <EmptyState
      area="files"
      title={t("files.none")}
      text={t("files.emptyText")}
      action={
        canManage && (
          <Button render={<Link href={withParams(sp, { new: "upload" })} scroll={false} />} nativeButton={false} size="sm">
            {t("files.upload")}
          </Button>
        )
      }
    />
  )

  const list = grid ? (
    rows.length ? (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {rows.map((r) => {
          const I = Icon(r.mime)
          const src = isImage(r.mime) ? thumb(r.path) : undefined
          return (
            <li key={r.id}>
              <Link href={withParams(sp, { edit: r.id })} scroll={false} className="group grid gap-2 rounded-xl border p-2 hover:bg-muted active:bg-muted">
                <span className="grid aspect-[4/3] place-items-center overflow-hidden rounded-lg bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage link */}
                  {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : <I className="size-8 text-muted-foreground" aria-hidden />}
                </span>
                <span className="grid min-w-0 px-1 pb-1">
                  <span className="truncate text-sm font-medium">{r.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{[r.folder ?? attached(r.entity), fileSize(r.size, t.locale)].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    ) : (
      empty
    )
  ) : (
    <DataTable
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => withParams(sp, { edit: r.id })}
      select={canManage && !trash ? { form: "bulk-files", label: t("common.select") } : undefined}
      empty={empty}
      columns={[
        {
          header: t("files.name"),
          cell: (r) => {
            const I = Icon(r.mime)
            return (
              <span className="flex min-w-0 items-center gap-2">
                <I className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{r.name}</span>
              </span>
            )
          },
        },
        { header: t("files.folder"), cell: (r) => r.folder ?? attached(r.entity) },
        { header: t("files.size"), cell: (r) => fileSize(r.size, t.locale), className: "whitespace-nowrap text-right tabular-nums" },
        { header: trash ? t("files.deleted") : t("files.added"), cell: (r) => t.date(trash ? r.deleted_at! : r.created_at), className: "whitespace-nowrap" },
      ]}
    />
  )

  return (
    <Page>
      <PageHeader
        area="files"
        title={trash ? t("files.trash") : t("files.title")}
        menu={
          canManage && (
            <ActionsMenu>
              <MenuLink href={trash ? "/files" : "/files?trash=1"} icon={trash ? <FolderIcon /> : <Trash2Icon />}>
                {trash ? t("files.backToFiles") : t("files.trash")}
              </MenuLink>
            </ActionsMenu>
          )
        }
        primary={canManage && !trash ? { href: withParams(sp, { new: "upload", edit: undefined }), label: t("files.upload") } : undefined}
      />
      <Notice error={!editId && !uploading ? param(sp, "error") : undefined} ok={!editId ? param(sp, "ok") : undefined} />

      <ListToolbar search={<SearchBox q={q} label={t("common.search")} />}>
        {!trash && folders.length > 0 && <FilterMenu param="folder" label={t("files.folder")} allLabel={t("files.allFolders")} options={folders.map((f) => ({ value: f, label: f }))} />}
        <Segments
          label={t("files.view")}
          className="md:ml-auto"
          items={[
            { href: withParams(sp, { view: undefined, page: undefined }), label: t("files.list"), current: !grid },
            { href: withParams(sp, { view: "grid", page: undefined }), label: t("files.grid"), current: grid },
          ]}
        />
      </ListToolbar>
      {trash && <p className="text-sm text-muted-foreground">{t("files.trashHint", { days: 30 })}</p>}

      {canManage && !trash ? (
        <FileDrop orgId={ctx.org.id} folder={folder}>
          {list}
        </FileDrop>
      ) : (
        list
      )}
      <Pager sp={sp} page={page} hasNext={(data?.length ?? 0) > PAGE_SIZE} newer={t("common.newer")} older={t("common.older")} />

      {uploading && (
        <UrlSheet params={["new"]} title={t("files.upload")} description={folder ? t("files.intoFolder", { folder }) : undefined} compact>
          <FileUpload orgId={ctx.org.id} folder={folder} big />
        </UrlSheet>
      )}

      {editing && (
        <UrlSheet
          params={["edit"]}
          title={editing.name}
          meta={`${fileSize(editing.size, t.locale)} · ${t.date(editing.created_at)}`}
          actions={
            !editing.deleted_at && (
              <Button render={<a href={`/files/${editing.id}?download=1`} />} nativeButton={false} size="sm" variant="outline">
                <DownloadIcon /> <span className="max-sm:sr-only">{t("files.download")}</span>
              </Button>
            )
          }
          menu={
            canManage &&
            !editing.deleted_at && (
              <ActionsMenu>
                <MenuSubmit form="trash-file" icon={<Trash2Icon />} destructive>
                  {t("files.remove")}
                </MenuSubmit>
              </ActionsMenu>
            )
          }
        >
          <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
          {isImage(editing.mime) && thumb(editing.path) ? (
            <a href={`/files/${editing.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage link */}
              <img src={thumb(editing.path) ?? undefined} alt={editing.name} className="max-h-80 w-full object-contain" />
            </a>
          ) : (
            <Button render={<a href={`/files/${editing.id}`} target="_blank" rel="noreferrer" />} nativeButton={false} variant="outline" className="justify-self-start">
              <ExternalLinkIcon /> {t("files.open")}
            </Button>
          )}
          <DetailList
            items={[
              editing.entity && editing.entity_id && {
                label: attached(editing.entity),
                value: RECORD_LINKS[editing.entity] ? (
                  <Link href={RECORD_LINKS[editing.entity](editing.entity_id)} className="link">
                    {t("files.openRecord", { record: attached(editing.entity) })}
                  </Link>
                ) : (
                  "–"
                ),
              },
              { label: t("files.type"), value: editing.mime ?? "–" },
            ]}
          />
          {editing.deleted_at ? (
            canManage && (
              <form action={restoreFile}>
                <input type="hidden" name="id" value={editing.id} />
                <SubmitButton>
                  <ArchiveRestoreIcon /> {t("files.restore")}
                </SubmitButton>
              </form>
            )
          ) : (
            <>
              {canManage && (
                <form id="trash-file" action={trashFile} hidden>
                  <input type="hidden" name="id" value={editing.id} />
                  <input type="hidden" name="back" value={`/files${withParams(sp, { edit: undefined })}`} />
                </form>
              )}
              <form action={updateFile} className="grid gap-4">
                <input type="hidden" name="id" value={editing.id} />
                <fieldset disabled={!canManage} className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="f-name">{t("files.name")}</Label>
                    <Input id="f-name" name="name" required maxLength={255} defaultValue={editing.name} />
                  </div>
                  {!editing.entity && (
                    <div className="grid gap-2">
                      <Label htmlFor="f-folder">{t("files.folder")}</Label>
                      <Input id="f-folder" name="folder" maxLength={200} defaultValue={editing.folder ?? ""} list="f-folders" />
                      <datalist id="f-folders">
                        {folders.map((f) => (
                          <option key={f} value={f} />
                        ))}
                      </datalist>
                      <p className="text-xs text-muted-foreground">{t("files.folderHint")}</p>
                    </div>
                  )}
                </fieldset>
                {canManage && <SaveBar />}
              </form>
            </>
          )}
        </UrlSheet>
      )}
      {canManage && !trash && !grid && (
        <BulkBar form="bulk-files">
          <input type="hidden" name="back" value={`/files${withParams(sp, { edit: undefined })}`} />
          <SubmitButton size="sm" variant="ghost" formAction={bulkTrashFiles} data-confirm="common.confirmTrashMany" className="text-destructive hover:text-destructive">
            <Trash2Icon /> {t("common.toTrash")}
          </SubmitButton>
        </BulkBar>
      )}
    </Page>
  )
}

export const instant = false
