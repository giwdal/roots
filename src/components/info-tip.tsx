"use client"

import { InfoIcon } from "lucide-react"
import { Label } from "@/components/ui/label"
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

/** A field label with its ⓘ next to it (the ⓘ sits outside the <label>, so it isn't part of the field's name). */
export function TipLabel({ htmlFor, tip, children }: { htmlFor?: string; tip: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-5 items-center gap-1">
      <Label htmlFor={htmlFor}>{children}</Label>
      <InfoTip label={typeof children === "string" ? children : undefined}>{tip}</InfoTip>
    </div>
  )
}

/** A section title with its ⓘ (Section / FormCard `title`): background that used to be a paragraph under the heading. */
export function TitleTip({ tip, children }: { tip: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <InfoTip label={typeof children === "string" ? children : undefined}>{tip}</InfoTip>
    </span>
  )
}
