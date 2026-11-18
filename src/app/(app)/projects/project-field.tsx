"use client"

import { useRef } from "react"
import { RecordPicker } from "@/components/record-picker"
import { useT } from "@/i18n/client"
import { searchProjects } from "../shifts/time-actions"

/** The task's project as a server-search picker inside the task panel's autosave form (a pick counts as an input). */
export function ProjectField({ initial, disabled }: { initial: { id: string; label: string } | null; disabled?: boolean }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  return (
    <div ref={box} className="min-w-0">
      <RecordPicker
        name="project_id"
        search={searchProjects}
        initial={initial}
        placeholder={t("projects.noProject")}
        disabled={disabled}
        onChange={() => requestAnimationFrame(() => box.current?.dispatchEvent(new Event("input", { bubbles: true })))}
      />
    </div>
  )
}
