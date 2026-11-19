"use client"

import { InfoIcon } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/client"

/**
 * Background to a field or setting that most people don't need every time: a small ⓘ next to the label instead of a
 * paragraph under the field. Click/tap opens it (a popover; on phones a small sheet), so it also works on touch.
 * Keep one-line hints that matter for filling the field visible; move explanations ("what happens if …") in here.
 */
export function InfoTip({ children, label }: { children: React.ReactNode; label?: string }) {
  const t = useT()
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={label ?? t("common.moreInfo")}
        className="inline-grid size-5 shrink-0 translate-y-px place-items-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <InfoIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent sheet title={label} align="start" className="max-w-xs text-sm leading-relaxed text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  )
}
