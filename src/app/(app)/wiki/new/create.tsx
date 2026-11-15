"use client"

import { useEffect, useRef } from "react"
import { Loader2Icon } from "lucide-react"
import { useT } from "@/i18n/client"
import { newPageAction } from "../actions"

/** Creates the page once this opens (a link can't post) and lands on it. */
export function CreatePage({ parent }: { parent?: string }) {
  const t = useT()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const fd = new FormData()
    if (parent) fd.set("parent_id", parent)
    void newPageAction(fd)
  }, [parent])
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" /> {t("wiki.creating")}
    </p>
  )
}
