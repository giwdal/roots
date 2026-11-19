"use client"

import { InlineTitle as Title } from "@/components/inline-title"
import { useT } from "@/i18n/client"
import { patchProject } from "./actions"

/** The project's name as the page title, edited in place (patchProject). */
export function InlineTitle({ id, name, disabled }: { id: string; name: string; disabled?: boolean }) {
  const t = useT()
  return <Title action={patchProject} id={id} name={name} label={t("projects.name")} disabled={disabled} />
}
