import { DateInput } from "@/components/date-input"
import { Notice } from "@/components/notice"
import { RecordPicker } from "@/components/record-picker"
import { SaveBar } from "@/components/save-bar"
import { UrlSheet } from "@/components/url-sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import { searchProjects } from "../shifts/time-actions"
import { createTaskAction } from "./actions"
import { PeopleSelect } from "./people-select"

/**
 * "Neue Aufgabe" (?new=task): title, project (fixed on a project page, else a search picker), due date, assignees.
 * Creating opens the new task's panel for everything else. `due` pre-fills the date (a calendar day).
 */
export function NewTaskSheet({ t, back, project, lockProject, due, me, team, error }: { t: T; back: string; project: { id: string; name: string } | null; lockProject: boolean; due?: string; me: { id: string; name: string } | null; team: { id: string; name: string }[]; error?: string }) {
  return (
    <UrlSheet params={["new", "due", "start", "end"]} title={t("projects.newTask")} meta={lockProject ? project?.name : undefined}>
      <Notice error={error} />
      <form action={createTaskAction} className="grid gap-4">
        <input type="hidden" name="back" value={back} />
        <div className="grid gap-2">
          <Label htmlFor="nt-title">{t("projects.taskTitle")}</Label>
          <Input id="nt-title" name="title" required maxLength={300} autoFocus autoComplete="off" />
        </div>
        {lockProject && project ? (
          <input type="hidden" name="project_id" value={project.id} />
        ) : (
          <RecordPicker name="project_id" label={t("projects.project")} search={searchProjects} initial={project ? { id: project.id, label: project.name } : null} placeholder={t("projects.noProject")} />
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <Label htmlFor="nt-due">{t("projects.due")}</Label>
            <DateInput id="nt-due" name="due_on" type="date" defaultValue={due ?? ""} />
          </div>
          <div className="grid content-start gap-2">
            <Label htmlFor="nt-people">{t("projects.assignees")}</Label>
            <PeopleSelect id="nt-people" name="assignees" team={team} defaultValue={me ? [me.id] : []} />
          </div>
        </div>
        <SaveBar label={t("projects.createTask")} always />
      </form>
    </UrlSheet>
  )
}
