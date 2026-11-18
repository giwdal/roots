"use client"

import { createContext, useContext, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { EllipsisIcon, SettingsIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ContentSheet, ContentSheetClose, ContentSheetTitle } from "@/components/content-sheet"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

/**
 * The ⋯ button in a page header: everything that isn't the main action (import, export, trash, duplicate, delete).
 * Icons are elements (icon={<Trash2Icon />}): server pages can't pass components into this client file.
 * Items: <MenuLink> (navigation, drawers via ?param), <MenuDownload> (files), <MenuSubmit form="<form id>"> (posts a
 * hidden <form id=…> on the page, so actions stay plain server-action forms), <MenuSeparator>.
 * Phones: the dropdown is an action sheet (DropdownMenuContent); in a page header the items join the header's phone
 * ⋯ sheet (<PhoneMenu>), where they render as plain rows (Inline context below).
 */
export function ActionsMenu({ children, label }: { children: React.ReactNode; label?: string }) {
  const t = useT()
  const inline = useContext(Inline)
  const text = label ?? t("common.moreActions")
  if (inline) return <>{children}</>
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger render={<DropdownMenuTrigger render={<Button size="icon-sm" variant="outline" aria-label={text} />} />}>
          <EllipsisIcon />
        </TooltipTrigger>
        <TooltipContent>{text}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Inside <PhoneMenu>: the items render as rows of the sheet; `close` slides it away after a tap.
const Inline = createContext<{ close: () => void } | null>(null)

const ROW =
  "flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-xl px-3 text-left text-base select-none [-webkit-tap-highlight-color:transparent] active:bg-muted [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
const DANGER = "text-destructive [&_svg]:text-destructive"

export function MenuLink({ href, icon, children, destructive }: { href: string; icon?: React.ReactNode; children: React.ReactNode; destructive?: boolean }) {
  const inline = useContext(Inline)
  if (inline)
    return (
      <Link href={href} scroll={false} onClick={inline.close} className={cn(ROW, destructive && DANGER)}>
        {icon} {children}
      </Link>
    )
  return (
    <DropdownMenuItem render={<Link href={href} scroll={false} />} variant={destructive ? "destructive" : "default"}>
      {icon} {children}
    </DropdownMenuItem>
  )
}

export function MenuDownload({ href, icon, children }: { href: string; icon?: React.ReactNode; children: React.ReactNode }) {
  const inline = useContext(Inline)
  if (inline)
    return (
      <a href={href} onClick={inline.close} className={ROW}>
        {icon} {children}
      </a>
    )
  return (
    <DropdownMenuItem render={<a href={href} />}>
      {icon} {children}
    </DropdownMenuItem>
  )
}

/** A titled group of items (e.g. "Mail erneut senden" → one item per mail). */
export function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const inline = useContext(Inline)
  if (inline)
    return (
      <div role="group" aria-label={label} className="grid">
        <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{label}</p>
        {children}
      </div>
    )
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  )
}

// Destructive items ask first (<ConfirmHost>, default: the trash question); `confirm` = the question's message key,
// also for items that aren't red but still need a yes (unpublish, resend).
// As a sheet row the button closes the sheet on tap; ConfirmHost then asks and submits the page's hidden form
// (the row is gone by then, which it handles like a closed dropdown item).
export function MenuSubmit({ form, icon, children, destructive, confirm }: { form: string; icon?: React.ReactNode; children: React.ReactNode; destructive?: boolean; confirm?: string }) {
  const inline = useContext(Inline)
  const ask = confirm ?? (destructive ? "common.confirmTrash" : undefined)
  if (inline)
    return (
      <button type="submit" form={form} data-confirm={ask} onClick={inline.close} className={cn(ROW, destructive && DANGER)}>
        {icon} {children}
      </button>
    )
  return (
    <DropdownMenuItem render={<button type="submit" form={form} className="w-full text-left" data-confirm={ask} />} nativeButton variant={destructive ? "destructive" : "default"}>
      {icon} {children}
    </DropdownMenuItem>
  )
}

/** "Export" group: Excel + CSV of what the list shows (pass its filters as `query`). */
export function MenuExport({ entity, query = {}, label }: { entity: string; query?: Record<string, string | undefined>; label?: string }) {
  const t = useT()
  const inline = useContext(Inline)
  const href = (format: string) => `/export/${entity}?${new URLSearchParams(Object.entries({ ...query, format }).filter((x): x is [string, string] => !!x[1]))}`
  if (inline)
    return (
      <MenuGroup label={label ?? t("export.button")}>
        <MenuDownload href={href("xlsx")}>{t("export.xlsx")}</MenuDownload>
        <MenuDownload href={href("csv")}>{t("export.csv")}</MenuDownload>
      </MenuGroup>
    )
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label ?? t("export.button")}</DropdownMenuLabel>
      <DropdownMenuItem render={<a href={href("xlsx")} />}>{t("export.xlsx")}</DropdownMenuItem>
      <DropdownMenuItem render={<a href={href("csv")} />}>{t("export.csv")}</DropdownMenuItem>
    </DropdownMenuGroup>
  )
}

export function MenuSeparator({ className }: { className?: string }) {
  const inline = useContext(Inline)
  if (inline) return <div role="separator" className={cn("mx-3 my-1 h-px bg-border", className)} />
  return <DropdownMenuSeparator className={className} />
}

/**
 * Phones: a page header's one ⋯ in the top bar. Its action sheet collects what sits in the header's right side from
 * md: a form-button primary, the gear (area settings), the header `actions` (as full-width rows) and the items of the
 * page's <ActionsMenu> (destructive ones last, as the page orders them), then "Abbrechen".
 * Links and finished submits close the sheet; buttons that open their own sheet keep it underneath.
 */
export function PhoneMenu({ settings, actions, primary, children }: { settings?: { href: string; label: string }; actions?: React.ReactNode; primary?: React.ReactNode; children?: React.ReactNode }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const closer = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()
  // Another page: the sheet's links have done their job.
  useEffect(() => setOpen(false), [pathname]) // eslint-disable-line react-hooks/set-state-in-effect -- closes on navigation
  if (!settings && !actions && !primary && !children) return null
  const close = () => closer.current?.click() // slides the sheet down (ContentSheet owns its open state)
  return (
    <>
      <Button variant="ghost" size="icon" aria-label={t("common.moreActions")} onClick={() => setOpen(true)} className="size-9">
        <EllipsisIcon className="size-5" />
      </Button>
      {open && (
        <ContentSheet compact closeButton={false} header={null} label={t("common.moreActions")} onClose={() => {}} onClosed={() => setOpen(false)}>
          <ContentSheetTitle className="sr-only">{t("common.moreActions")}</ContentSheetTitle>
          <ContentSheetClose ref={closer} className="hidden" tabIndex={-1} aria-hidden />
          <div
            className="grid gap-0.5 px-2 pt-1 pb-2"
            onClickCapture={(e) => {
              if ((e.target as Element).closest("a[href]")) close()
            }}
            // A submit that got through (ConfirmHost answered yes, or none was needed): the action runs, the sheet goes.
            onSubmit={() => setTimeout(close)}
          >
            {primary && <div data-slot="sheet-primary" className="grid pb-1">{primary}</div>}
            {settings && (
              <Link href={settings.href} className={ROW}>
                <SettingsIcon /> {settings.label}
              </Link>
            )}
            {actions && (
              // Header actions are buttons/links/forms of their own: shown as rows, each keeping its behaviour.
              <div data-slot="sheet-actions" className="grid gap-0.5">
                {actions}
              </div>
            )}
            {children && <Inline value={{ close }}>{children}</Inline>}
            <div role="separator" className="mx-3 my-1 h-px bg-border" />
            <ContentSheetClose className={cn(ROW, "justify-center font-medium")}>{t("common.cancel")}</ContentSheetClose>
          </div>
        </ContentSheet>
      )}
    </>
  )
}
