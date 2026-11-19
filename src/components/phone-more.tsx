"use client"

import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { useT } from "@/i18n/client"

/**
 * Phones: shows `rest` only after "Alle anzeigen" (a record's first few properties stay visible, the long tail folds
 * away); from md everything is always shown and the button is gone.
 */
export function PhoneMore({ count, children }: { count: number; children: React.ReactNode }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!count) return null
  return (
    <>
      <div className={open ? undefined : "max-md:hidden"}>{children}</div>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-(--control-sm) items-center gap-1 text-sm text-[var(--link)] md:hidden">
          <ChevronDownIcon className="size-4" /> {t("common.showMore", { count })}
        </button>
      )}
    </>
  )
}
