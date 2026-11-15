"use client"

import { Dialog } from "@base-ui/react/dialog"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

// Where the sheet sits: over the content area only (not the sidebar, not the Sprout panel), below the top bar, a
// gap to the sides. Measured from the App shell, so a collapsed sidebar or an open Sprout panel just work; phones:
// full width. Set straight on the element (no state), again on resize.
function place(el: HTMLElement) {
  const inset = document.querySelector<HTMLElement>("[data-slot=sidebar-inset]")
  if (!inset || window.innerWidth < 768) return Object.assign(el.style, { left: "0px", right: "0px", top: "2.5rem" })
  const r = inset.getBoundingClientRect()
  const head = inset.querySelector("header")?.getBoundingClientRect().bottom ?? r.top
  Object.assign(el.style, { left: `${r.left + 16}px`, right: `${window.innerWidth - r.right + 16}px`, top: `${head + 16}px` })
}

/**
 * The App's drawer: a large sheet rising from the bottom over the content area, rounded top corners, close (X) top
 * right. `<UrlSheet>` uses it for every record/new/edit drawer; the content column is centred (wide = imports,
 * previews). Keeps data-slot="sheet-content" so the SaveBar sticks inside it.
 */
export function ContentSheet({ onClose, wide, children, label }: { onClose: () => void; wide?: boolean; children: React.ReactNode; label?: string }) {
  const t = useT()
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop onClick={onClose} className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
        <Dialog.Popup
          data-slot="sheet-content"
          aria-label={label}
          ref={(el) => {
            if (!el) return
            const update = () => place(el)
            update()
            window.addEventListener("resize", update)
            return () => window.removeEventListener("resize", update)
          }}
          className="fixed bottom-0 z-50 flex flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 bg-popover text-sm text-popover-foreground shadow-2xl transition duration-300 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full"
        >
          <Dialog.Close render={<Button variant="ghost" size="icon-sm" className="absolute top-4 right-4 z-30" />}>
            <XIcon />
            <span className="sr-only">{t("common.close")}</span>
          </Dialog.Close>
          <div className={cn("mx-auto flex w-full flex-1 flex-col", wide ? "max-w-6xl" : "max-w-3xl")}>{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export const ContentSheetTitle = Dialog.Title
export const ContentSheetDescription = Dialog.Description
