"use server"

import { pickedIds, trashMany } from "@/lib/bulk"
import { revalidatePath } from "next/cache"
import { deliverSoon } from "@/events/worker"
import { getT } from "@/i18n/server"
import { dbError, type T } from "@/i18n/translate"
import { requirePerm } from "@/lib/context"
import { back } from "@/lib/url"
import { parseTags } from "@/app/(app)/contacts/fields"
import { loadFields, readCustom } from "@/lib/custom-fields"
import { addComment, addLink, editComment, removeComment, createProject, createTask, moveProject, moveTask, saveStatus, setAssignees, updateProject, updateTask, type ProjectFail } from "@/projects/server"

const UUID = /^[0-9a-f-]{36}$/
const SETUP = "/projects/settings"
const id = (fd: FormData, key: string) => (UUID.test(String(fd.get(key) ?? "")) ? String(fd.get(key)) : null)
const message = (t: T, f: ProjectFail) => (f.db ? dbError(t, f.db) : t.dynamic(f.error))
// Where the form came from (board / list / home), only App paths (no "//host").
const backTo = (fd: FormData, fallback: string) => {
  const b = String(fd.get("back") ?? "")
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback
}

// Every change drops the client's cached /projects pages (staleTimes), so closing the panel shows the new state.
async function manager() {
  revalidatePath("/projects", "layout")
  revalidatePath("/")
  const ctx = await requirePerm("projects.manage")
  const t = await getT()
  if (!ctx.modules.has("projects")) back("/projects", { error: t("errors.not_allowed") })
  return { ctx, t }
}

/** The "Neue Aufgabe" sheet (?new=task): title, project, due date, assignees → the new task's panel. */
export async function createTaskAction(fd: FormData) {
  const { ctx, t } = await manager()
  const to = backTo(fd, "/projects/tasks")
  const retry = (error: string) => {
    const url = new URL(to, "http://x")
    url.searchParams.set("new", "task")
    back(url.pathname + url.search, { error })
  }
  const r = await createTask(ctx.supabase, ctx.org.id, {
    title: String(fd.get("title") ?? ""),
    statusId: id(fd, "status_id"),
    projectId: id(fd, "project_id"),
    due_on: String(fd.get("due_on") ?? "") || null,
    tags: parseTags(String(fd.get("tags") ?? "")),
    assignees: fd.getAll("assignees").map(String).filter((u) => UUID.test(u)),
  })
  if ("error" in r) return retry(message(t, r))
  deliverSoon()
  const url = new URL(to, "http://x")
  url.searchParams.delete("new")
  url.searchParams.delete("due")
  url.searchParams.set("task", r.id)
  back(url.pathname + url.search, {})
}

/** Quick add (type + Enter) on the list and the board: the task appears, the field stays ready for the next one. */
export async function quickAddTaskAction(input: { title: string; statusId?: string; projectId?: string; mine?: boolean }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const ok = (v?: string) => (v && UUID.test(v) ? v : null)
  const r = await createTask(ctx.supabase, ctx.org.id, { title: String(input.title ?? ""), statusId: ok(input.statusId), projectId: ok(input.projectId), assignees: input.mine ? [ctx.userId] : [] })
  if ("error" in r) return { error: message(t, r) }
  deliverSoon()
  return {}
}

export async function restoreTaskAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.tasks", p_id: id(fd, "id") ?? "" })
  back(backTo(fd, "/projects/tasks?trash=1"), error ? { error: dbError(t, error) } : { ok: t("projects.taskRestored") })
}

/** The task panel saves itself (AutosaveForm): fields, status, assignees. */
export async function autosaveTaskAction(fd: FormData): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const task = id(fd, "id") ?? ""
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "tasks"), (k) => String(fd.get(`custom.${k}`) ?? ""))
  if ("error" in c) return { error: `${c.field}: ${t.dynamic(c.error)}` }
  const r = await updateTask(ctx.supabase, ctx.org.id, task, {
    title: String(fd.get("title") ?? ""),
    description: String(fd.get("description") ?? ""),
    start_on: String(fd.get("start_on") ?? "") || null,
    due_on: String(fd.get("due_on") ?? "") || null,
    tags: parseTags(String(fd.get("tags") ?? "")),
    statusId: id(fd, "status_id") ?? undefined,
    projectId: id(fd, "project_id"),
    custom: c.custom,
  })
  if ("error" in r) return { error: message(t, r) }
  const a = await setAssignees(ctx.supabase, ctx.org.id, task, fd.getAll("assignees").map(String).filter((u) => UUID.test(u)))
  if ("error" in a) return { error: message(t, a) }
  deliverSoon()
  return {}
}

/** Board drag & drop (called from the board). */
export async function moveTaskAction(input: { id: string; statusId: string; order: string[] }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.id) || !UUID.test(input.statusId)) return { error: t("errors.invalid_input") }
  const r = await moveTask(ctx.supabase, ctx.org.id, input.id, input.statusId, input.order.filter((x) => UUID.test(x)))
  deliverSoon()
  return "error" in r ? { error: message(t, r) } : {}
}

/** Checklist (ticks and rows save at once). */
export async function saveChecklistAction(input: { id: string; checklist: unknown }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.id)) return { error: t("errors.invalid_input") }
  const r = await updateTask(ctx.supabase, ctx.org.id, input.id, { checklist: input.checklist })
  return "error" in r ? { error: message(t, r) } : {}
}

export async function trashTaskAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.tasks", p_id: id(fd, "id") ?? "" })
  const to = backTo(fd, "/projects").replace(/([?&])task=[^&]*&?/, "$1").replace(/[?&]$/, "")
  back(to, error ? { error: dbError(t, error) } : { ok: t("projects.trashed") })
}

// ---------- board columns (setup) ----------

/**
 * Both boards' columns in one form (settings page, one SaveBar): per scope the rows `<scope>_id/_name/_color/_done`
 * in their order. Removed columns are deleted (a column that still holds tasks or projects fails with a message).
 */
export async function saveColumnsAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { data: existing } = await ctx.supabase.from("task_statuses").select("id, scope").eq("org_id", ctx.org.id)
  for (const scope of ["task", "project"] as const) {
    const ids = fd.getAll(`${scope}_id`).map(String)
    const colors = fd.getAll(`${scope}_color`).map(String)
    const done = fd.getAll(`${scope}_done`).map(String)
    const rows = fd.getAll(`${scope}_name`).map((n, i) => ({ id: UUID.test(ids[i] ?? "") ? ids[i] : null, name: String(n), color: colors[i] ?? "gray", is_done: done[i] === "1" }))
    if (!rows.length) back(SETUP, { error: t("projects.noStatuses") })
    const keep = new Set(rows.map((r) => r.id).filter(Boolean))
    const gone = (existing ?? []).filter((s) => s.scope === scope && !keep.has(s.id)).map((s) => s.id)
    for (const [position, r] of rows.entries()) {
      const saved = await saveStatus(ctx.supabase, ctx.org.id, r.id, r, scope)
      if ("error" in saved) back(SETUP, { error: message(t, saved) })
      const { error } = await ctx.supabase.from("task_statuses").update({ position }).eq("id", "id" in saved ? saved.id : "").eq("org_id", ctx.org.id)
      if (error) back(SETUP, { error: dbError(t, error) })
    }
    if (gone.length) {
      const { error } = await ctx.supabase.from("task_statuses").delete().eq("org_id", ctx.org.id).in("id", gone)
      if (error) back(SETUP, { error: error.code === "23503" ? t("projects.statusInUse") : dbError(t, error) })
    }
  }
  back(SETUP, { ok: t("projects.saved") })
}

/** Bulk bar on the task list: move the ticked tasks to another column, or to the trash. */
export async function bulkTasks(fd: FormData) {
  const { ctx, t } = await manager()
  const ids = pickedIds(fd)
  const to = backTo(fd, "/projects?view=list")
  if (!ids.length) back(to, {})
  if (fd.get("intent") === "trash") {
    const error = await trashMany(ctx, "public.tasks", ids)
    back(to, error ? { error: dbError(t, error) } : { ok: t("common.bulkTrashed", { count: ids.length }) })
  }
  const statusId = id(fd, "status_id")
  if (!statusId) back(to, { error: t("errors.invalid_input") })
  const results = await Promise.all(ids.map((x) => updateTask(ctx.supabase, ctx.org.id, x, { statusId })))
  const failed = results.find((r) => "error" in r)
  deliverSoon()
  back(to, failed && "error" in failed ? { error: message(t, failed) } : { ok: t("common.bulkDone", { count: ids.length }) })
}

/** Calendar drag & drop: the task's new due date (the day it was dropped on, Berlin time). */
export async function moveTaskDue(id: string, start: string): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const day = new Date(start).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" })
  if (!UUID.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: t("errors.invalid_input") }
  const r = await updateTask(ctx.supabase, ctx.org.id, id, { due_on: day })
  return "error" in r ? { error: message(t, r) } : {}
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
const dayOrNull = (d: string | null) => (d === null ? null : DAY.test(d) ? d : undefined)

/** Timeline drag: a task's new start/end (null = that date stays empty). */
export async function moveTaskDates(id: string, start: string | null, end: string | null): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const [s, e] = [dayOrNull(start), dayOrNull(end)]
  if (!UUID.test(id) || s === undefined || e === undefined) return { error: t("errors.invalid_input") }
  const r = await updateTask(ctx.supabase, ctx.org.id, id, { start_on: s, due_on: e })
  return "error" in r ? { error: message(t, r) } : {}
}

/** Timeline drag on the project list: a project's new start/end. */
export async function moveProjectDates(id: string, start: string | null, end: string | null): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const [s, e] = [dayOrNull(start), dayOrNull(end)]
  if (!UUID.test(id) || s === undefined || e === undefined) return { error: t("errors.invalid_input") }
  const r = await updateProject(ctx.supabase, ctx.org.id, id, { start_on: s, end_on: e })
  return "error" in r ? { error: message(t, r) } : {}
}

// ---------- projects ----------

const readProjectForm = async (ctx: Awaited<ReturnType<typeof manager>>["ctx"], fd: FormData) => {
  const c = readCustom(await loadFields(ctx.supabase, ctx.org.id, "projects"), (k) => String(fd.get(`custom.${k}`) ?? ""))
  return {
    c,
    input: {
      name: fd.has("name") ? String(fd.get("name")) : undefined,
      description: String(fd.get("description") ?? ""),
      color: String(fd.get("color") ?? "blue"),
      start_on: String(fd.get("start_on") ?? "") || null,
      end_on: String(fd.get("end_on") ?? "") || null,
      statusId: id(fd, "status_id"),
      leadId: id(fd, "lead_id"),
    },
  }
}

/** /projects/new and the quick add on the project board → the new project's page. */
export async function createProjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const from = backTo(fd, "/projects/new")
  const { c, input } = await readProjectForm(ctx, fd)
  if ("error" in c) back(from, { error: `${c.field}: ${t.dynamic(c.error)}` })
  const r = await createProject(ctx.supabase, ctx.org.id, { ...input, name: input.name ?? "", custom: c.custom })
  if ("error" in r) back(from, { error: message(t, r) })
  back(`/projects/${r.id}`, { ok: t("projects.projectCreated") })
}

// Properties of a project edited in place on its page (InlineField / autosave), form key → what updateProject gets.
const PATCHABLE = ["name", "description", "color", "start_on", "end_on", "status_id", "lead_id"] as const

/** One property of a project (InlineField, the title, the description): checked like the full form, only that column saved. */
export async function patchProject(fd: FormData): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  const project = id(fd, "id")
  const raw = String(fd.get("field") ?? "")
  const field = PATCHABLE.find((f) => f === raw)
  const value = String(fd.get("value") ?? "")
  if (!project || (!field && !/^custom\.[a-z0-9_]+$/.test(raw))) return { error: t("errors.invalid_input") }
  let input: Parameters<typeof updateProject>[3]
  if (!field) {
    // A custom field: the stored values in form format with the new one on top, checked by readCustom like the form.
    const [{ data: p }, defs] = await Promise.all([ctx.supabase.from("projects").select("custom").eq("id", project).eq("org_id", ctx.org.id).maybeSingle(), loadFields(ctx.supabase, ctx.org.id, "projects")])
    if (!p) return { error: t("errors.not_allowed") }
    const stored = (p.custom ?? {}) as Record<string, unknown>
    const current: Record<string, string> = Object.fromEntries(defs.map((d) => [d.key, stored[d.key] == null ? "" : d.type === "money" && typeof stored[d.key] === "number" ? (stored[d.key] as number).toFixed(2).replace(".", ",") : String(stored[d.key])]))
    current[raw.slice("custom.".length)] = value
    const c = readCustom(defs, (k) => current[k] ?? "")
    if ("error" in c) return { error: `${c.field}: ${t.dynamic(c.error)}` }
    input = { custom: c.custom }
  } else if (field === "status_id") {
    const { data: s } = await ctx.supabase.from("task_statuses").select("id").eq("id", UUID.test(value) ? value : "").eq("org_id", ctx.org.id).eq("scope", "project").maybeSingle()
    if (!s) return { error: t("errors.invalid_input") }
    input = { statusId: s.id }
  } else if (field === "lead_id") {
    if (value && !UUID.test(value)) return { error: t("errors.invalid_input") }
    if (value) {
      const { data: m } = await ctx.supabase.from("org_members").select("user_id").eq("org_id", ctx.org.id).eq("user_id", value).maybeSingle()
      if (!m) return { error: t("errors.invalid_input") }
    }
    input = { leadId: value || null }
  } else if (field === "start_on" || field === "end_on") input = { [field]: value || null }
  else input = { [field]: value }
  const r = await updateProject(ctx.supabase, ctx.org.id, project, input)
  if ("error" in r) return { error: message(t, r) }
  deliverSoon()
  return {}
}

export async function moveProjectAction(input: { id: string; statusId: string; order: string[] }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.id) || !UUID.test(input.statusId)) return { error: t("errors.invalid_input") }
  const r = await moveProject(ctx.supabase, ctx.org.id, input.id, input.statusId, input.order.filter((x) => UUID.test(x)))
  return "error" in r ? { error: message(t, r) } : {}
}

export async function trashProjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("soft_delete", { p_table: "public.projects", p_id: id(fd, "id") ?? "" })
  back("/projects", error ? { error: dbError(t, error) } : { ok: t("projects.projectTrashed") })
}

export async function restoreProjectAction(fd: FormData) {
  const { ctx, t } = await manager()
  const { error } = await ctx.supabase.rpc("restore_deleted", { p_table: "public.projects", p_id: id(fd, "id") ?? "" })
  back("/projects?trash=1", error ? { error: dbError(t, error) } : { ok: t("projects.restored") })
}

// ---------- links ----------

export async function addLinkAction(input: { projectId: string; entity: string; entityId: string }): Promise<{ error?: string }> {
  const { ctx, t } = await manager()
  if (!UUID.test(input.projectId) || !UUID.test(input.entityId)) return { error: t("errors.invalid_input") }
  const r = await addLink(ctx.supabase, ctx.org.id, input.projectId, input.entity, input.entityId)
  return "error" in r ? { error: message(t, r) } : {}
}

export async function removeLinkAction(fd: FormData) {
  const { ctx, t } = await manager()
  const project = id(fd, "project_id") ?? ""
  const { error } = await ctx.supabase.from("project_links").delete().eq("id", id(fd, "id") ?? "").eq("org_id", ctx.org.id)
  back(`/projects/${project}?edit=links`, error ? { error: dbError(t, error) } : {})
}

// ---------- comments (everyone who sees projects may comment) ----------

async function viewer() {
  revalidatePath("/projects", "layout")
  const ctx = await requirePerm("projects.view")
  const t = await getT()
  return { ctx, t }
}

export async function addCommentAction(fd: FormData) {
  const { ctx, t } = await viewer()
  const to = backTo(fd, "/projects")
  const files = String(fd.get("file_ids") ?? "").split(",").filter(Boolean)
  const r = await addComment(ctx.supabase, ctx.org.id, String(fd.get("entity") ?? ""), id(fd, "entity_id") ?? "", String(fd.get("body") ?? ""), files)
  back(to, "error" in r ? { error: message(t, r) } : {})
}

export async function editCommentAction(fd: FormData) {
  const { ctx, t } = await viewer()
  const r = await editComment(ctx.supabase, ctx.org.id, id(fd, "id") ?? "", String(fd.get("body") ?? ""), fd.has("file_ids") ? String(fd.get("file_ids")).split(",").filter(Boolean) : undefined)
  back(backTo(fd, "/projects"), "error" in r ? { error: message(t, r) } : {})
}

export async function deleteCommentAction(fd: FormData) {
  const { ctx, t } = await viewer()
  const r = await removeComment(ctx.supabase, ctx.org.id, id(fd, "id") ?? "")
  back(backTo(fd, "/projects"), "error" in r ? { error: message(t, r) } : {})
}
