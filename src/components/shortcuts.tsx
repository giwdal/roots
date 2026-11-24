"use client"

import { useEffect, useState } from "react"
import { ContentSheet, ContentSheetTitle } from "@/components/content-sheet"
import { useT } from "@/i18n/client"

// Page keys outside text fields: N = the page's main "new" button (PageHeader `primary`), / = the list search,
// ? = this list of keys (also from the user menu: "Tastenkürzel", via the `shortcuts:open` event).
export function Shortcuts() {
  const t = useT()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      const el = e.target as HTMLElement
      if (el.closest("input, textarea, select, [contenteditable=true], [role=dialog], [role=menu]")) return
      if (e.key === "n") document.querySelector<HTMLElement>('[data-shortcut="new"]')?.click()
      else if (e.key === "?") setOpen(true)
      else if (e.key === "/") {
        const box = document.querySelector<HTMLInputElement>('[data-shortcut="search"]')
        if (!box) return
        e.preventDefault()
        box.focus()
      } else return
    }
    const show = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener("shortcuts:open", show)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("shortcuts:open", show)
    }
  }, [])
  if (!open) return null
  const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
  const keys: [string[], string][] = [
    [[mac ? "⌘" : "Ctrl", "K"], t("shortcuts.search")],
    [[mac ? "⌘" : "Ctrl", "B"], t("shortcuts.sidebar")],
    [["N"], t("shortcuts.new")],
    [["/"], t("shortcuts.listSearch")],
    [["Esc"], t("shortcuts.close")],
    [["?"], t("shortcuts.help")],
  ]
  return (
    <ContentSheet compact label={t("shortcuts.title")} onClose={() => {}} onClosed={() => setOpen(false)} header={<ContentSheetTitle className="text-base font-semibold">{t("shortcuts.title")}</ContentSheetTitle>}>
      <ul className="grid gap-1 px-6 pb-6">
        {keys.map(([k, label]) => (
          <li key={label} className="flex min-h-10 items-center justify-between gap-4 text-sm">
            <span>{label}</span>
            <span className="flex gap-1">
              {k.map((x) => (
                <kbd key={x} className="min-w-6 rounded-md border bg-muted px-1.5 py-0.5 text-center font-mono text-xs">
                  {x}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </ContentSheet>
  )
}
