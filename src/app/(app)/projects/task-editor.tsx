import { CustomFieldInputs } from "@/components/custom-field-inputs"
import { Markdown } from "@/components/markdown"
import { PeopleSelect } from "./people-select"
import { TagSelect } from "@/components/tag-select"
import { Label } from "@/components/ui/label"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Textarea } from "@/components/ui/textarea"
import type { T } from "@/i18n/translate"
import type { CustomValues, FieldDef } from "@/lib/custom-fields"
import type { ChecklistItem } from "@/projects/fields"
import { autosaveTaskAction, trashTaskAction } from "./actions"
import { AutosaveForm } from "./autosave-form"
import { Checklist } from "./checklist"
import { DateInput } from "@/components/date-input"
import { ProjectField } from "./project-field"

export type EditorTask = { id: string; title: string; description: string; status_id: string; project_id: string | null; start_on: string | null; due_on: string | null; custom: unknown; tags: string[]; checklist: unknown; created_at: string; completed_at: string | null; task_assignees: { user_id: string }[] }

// Everything about one task, Linear-style: title and description edited in place, then the properties as rows
// (label · control) — all in one form that saves itself on every change — then the checklist (saves at once) and the
// hidden trash form (the panel's ⋯ posts it).
export function TaskEditor({
  t,
  task,
  statuses,
  team,
  tags,
  project,
  defs,
  canManage,
  back,
}: {
  t: T
  task: EditorTask
  statuses: { id: string; name: string }[]
  team: { id: string; name: string }[]
  tags: string[]
  project: { id: string; name: string } | null
  defs: FieldDef[]
  canManage: boolean
  back: string
}) {
  const assigned = task.task_assignees.map((a) => a.user_id)
  const row = (label: string, htmlFor: string | undefined, control: React.ReactNode) => (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
      <Label htmlFor={htmlFor} className="text-muted-foreground">
        {label}
      </Label>
      {control}
    </div>
  )
  return (
    <div className="grid gap-6">
      <AutosaveForm action={autosaveTaskAction} className="grid gap-5">
        <input type="hidden" name="id" value={task.id} />
        <fieldset disabled={!canManage} className="grid gap-5">
          <div className="grid gap-1">
            <input
              name="title"
              defaultValue={task.title}
              maxLength={300}
              required
              aria-label={t("projects.taskTitle")}
              className="-mx-2 mr-20 rounded-md bg-transparent px-2 py-1 font-heading text-lg font-semibold outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent"
            />
            {canManage ? (
              <Textarea
                name="description"
                defaultValue={task.description}
                maxLength={100000}
                aria-label={t("projects.description")}
                placeholder={t("projects.descriptionAdd")}
                className="-mx-2 min-h-16 w-[calc(100%+1rem)] resize-none border-transparent bg-transparent px-2 shadow-none [field-sizing:content] hover:bg-muted/60 focus-visible:bg-transparent dark:bg-transparent"
              />
            ) : (
              task.description.trim() && <Markdown>{task.description}</Markdown>
            )}
          </div>
          <section aria-label={t("projects.properties")} className="grid gap-2 rounded-xl border p-3">
            {row(
              t("projects.status"),
              "tk-status",
              <NativeSelect id="tk-status" name="status_id" defaultValue={task.status_id} className="w-full">
                {statuses.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>,
            )}
            {row(t("projects.assignees"), "tk-people", <PeopleSelect id="tk-people" name="assignees" team={team} defaultValue={assigned} />)}
            {row(t("projects.due"), "tk-due", <DateInput id="tk-due" name="due_on" type="date" defaultValue={task.due_on ?? ""} />)}
            {row(t("projects.start"), "tk-start", <DateInput id="tk-start" name="start_on" type="date" defaultValue={task.start_on ?? ""} />)}
            {row(t("projects.project"), undefined, <ProjectField initial={project ? { id: project.id, label: project.name } : null} disabled={!canManage} />)}
            {row(t("projects.tags"), "tk-tags", <TagSelect id="tk-tags" name="tags" options={tags} defaultValue={task.tags} creatable />)}
          </section>
          {defs.length > 0 && <CustomFieldInputs defs={defs} values={(task.custom ?? {}) as CustomValues} idPrefix="tk-custom" />}
        </fieldset>
      </AutosaveForm>
      <Checklist taskId={task.id} initial={(Array.isArray(task.checklist) ? task.checklist : []) as ChecklistItem[]} disabled={!canManage} />
      {canManage && (
        <form id="trash-task" action={trashTaskAction} hidden>
          <input type="hidden" name="id" value={task.id} />
          <input type="hidden" name="back" value={back} />
        </form>
      )}
    </div>
  )
}

/** Under the drawer title: when the task was created / completed. */
export function taskMeta(t: T, task: Pick<EditorTask, "created_at" | "completed_at">) {
  return [t("projects.created", { date: t.date(task.created_at, { dateStyle: "medium" }) }), task.completed_at && t("projects.completedOn", { date: t.date(task.completed_at, { dateStyle: "medium" }) })].filter(Boolean).join(" · ")
}
