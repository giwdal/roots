"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { ListTreeIcon } from "lucide-react"
import { ContentSheet, ContentSheetTitle } from "@/components/content-sheet"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import type { PageRow } from "@/wiki/tree"
import { TreeNav } from "./tree-nav"

/** Phones and tablets: the page tree behind a "Seiten" button, as a sheet (desktop keeps it in the left column). */
export function TreeSheet({ rows, current }: { rows: PageRow[]; current?: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // A tapped page closes the sheet once it is there.
  useEffect(() => setOpen(false), [pathname]) // eslint-disable-line react-hooks/set-state-in-effect -- closes on navigation
  return (
    <>
      <Button type="button" variant="outline" className="lg:hidden" onClick={() => setOpen(true)}>
        <ListTreeIcon /> {t("wiki.tree")}
      </Button>
      {open && (
        <ContentSheet label={t("wiki.tree")} onClose={() => {}} onClosed={() => setOpen(false)} header={<ContentSheetTitle className="text-base font-semibold">{t("wiki.tree")}</ContentSheetTitle>}>
          <div className="px-4 pb-6 md:px-6">{rows.length ? <TreeNav rows={rows} current={current} label={t("wiki.tree")} /> : <p className="text-sm text-muted-foreground">{t("wiki.empty")}</p>}</div>
        </ContentSheet>
      )}
    </>
  )
}
