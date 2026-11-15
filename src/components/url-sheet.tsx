"use client"

import { useRef } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { confirmDiscard } from "@/components/save-bar"
import { ContentSheet, ContentSheetDescription, ContentSheetTitle } from "@/components/content-sheet"
import { useT } from "@/i18n/client"

// A drawer (bottom sheet over the content area, <ContentSheet>) that exists because a search param is set (?edit=<id>, ?new=…). Closing removes the param(s).
// Same anatomy everywhere: title, `meta` underneath (small, muted: "Angelegt am …"; live save status of an autosave
// form lands here too, via the sheet-status slot); `actions` (the main action, if any) and `menu` (the ⋯
// <ActionsMenu>, deleting = destructive item at the end) sit in the title row, left of the close button. The form's save bar sits at the bottom.
export function UrlSheet({
  params,
  title,
  description,
  meta,
  actions,
  menu,
  children,
  wide,
}: {
  params: string[]
  wide?: boolean // e.g. an import with a preview table
  title: string
  description?: string
  meta?: React.ReactNode
  actions?: React.ReactNode
  menu?: React.ReactNode
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useT()
  const answered = useRef(0)

  // Ask before throwing away unsaved changes (once per gesture: a backdrop click is an outside press and a click).
  const confirmClose = () => {
    if (Date.now() - answered.current < 500) return false
    const ok = confirmDiscard(document.querySelector("[data-slot=sheet-content]"), t("common.discardUnsaved"))
    answered.current = Date.now()
    return ok
  }
  // After the slide-down: drop the sheet's params (and ok/error) from the URL.
  const closed = () => {
    const next = new URLSearchParams(searchParams)
    for (const p of [...params, "error", "ok"]) next.delete(p)
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false })
  }

  return (
    <ContentSheet onClose={confirmClose} onClosed={closed} wide={wide} label={title}>
      <div className="grid gap-1.5 px-6 pt-6 pb-4">
        {/* Title row: actions + ⋯ sit left of the close button (absolute, top right). */}
        <div className="flex items-start gap-2 pr-10">
          <ContentSheetTitle className="min-w-0 flex-1 font-heading text-lg font-semibold break-words text-foreground">{title}</ContentSheetTitle>
          {(actions || menu) && (
            <div className="-mt-1 flex shrink-0 items-center gap-2">
              {actions}
              {menu}
            </div>
          )}
        </div>
        {description && <ContentSheetDescription className="text-sm text-muted-foreground">{description}</ContentSheetDescription>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground empty:hidden">
          {meta}
          <span data-slot="sheet-status" className="contents" />
        </div>
      </div>
      <div className="grid flex-1 content-start gap-6 px-6 pb-8">{children}</div>
    </ContentSheet>
  )
}
