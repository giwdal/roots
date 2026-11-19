"use client"

import { useState } from "react"
import { Drawer } from "@base-ui/react/drawer"
import { XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"

// Where it sits. Phones: a sheet from the bottom, full width, 2.5 rem below the top. From md: a dialog centred over the
// whole window, as wide as its kind allows, 10 % from the top. Set straight on the element (no state), again on resize.
const WIDTH = { compact: 520, normal: 720, wide: 1100 }
function place(el: HTMLElement, kind: keyof typeof WIDTH) {
  const inset = document.querySelector<HTMLElement>("[data-slot=sidebar-inset]")
  if (!inset || window.innerWidth < 768) {
    const top = "2.5rem"
    return Object.assign(el.style, kind === "compact" ? { left: "0px", right: "0px", top: "auto", bottom: "0px", maxHeight: `calc(100dvh - ${top})` } : { left: "0px", right: "0px", top, bottom: "0px", maxHeight: "" })
  }
  // Centred over the whole window (like every dialog), not over the content column.
  const width = Math.min(WIDTH[kind], window.innerWidth - 48)
  const left = (window.innerWidth - width) / 2
  const top = Math.max(48, Math.round(window.innerHeight * 0.1))
  Object.assign(el.style, { left: `${left}px`, right: `${window.innerWidth - left - width}px`, top: `${top}px`, bottom: "auto", maxHeight: `${window.innerHeight - top - 48}px` })
}

/**
 * The App's overlay for forms, quick creates, imports and confirmations: on phones a sheet rising from the bottom
 * (grab handle, swipe down), from md a dialog centred over the whole window. Title bar with close (X) on the right.
 * `<UrlSheet>` uses it for every record/new/edit overlay (wide = imports, previews; compact = short questions).
 * Keeps data-slot="sheet-content" so the SaveBar sticks inside it.
 */
export function ContentSheet({ onClose, onClosed, wide, compact, header, children, label, closeButton = true }: { onClose: () => boolean | void; onClosed: () => void; wide?: boolean; compact?: boolean; header: React.ReactNode; children: React.ReactNode; label?: string; closeButton?: boolean }) {
  const t = useT()
  // Closing: ask (`onClose` may say no), slide down, then `onClosed` (e.g. drop the URL param) once the animation ended.
  const [open, setOpen] = useState(true)
  return (
    <Drawer.Root
      open={open}
      swipeDirection="down"
      onOpenChange={(o, details) => {
        if (o) return
        // A vetoed close leaves the sheet open; for a swipe, Base UI resets the drag when the close is cancelled.
        if (onClose() === false) details.cancel()
        else setOpen(false)
      }}
      onOpenChangeComplete={(o) => !o && onClosed()}
    >
      <Drawer.Portal>
        <Drawer.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity md:bg-black/40 duration-200 animate-in fade-in-0 data-ending-style:opacity-0 motion-reduce:animate-none motion-reduce:transition-none" />
        <Drawer.VirtualKeyboardProvider>
          {/* The Viewport owns swipe handling; click-through so the backdrop and the page still get presses. */}
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50">
          <Drawer.Popup
            data-slot="sheet-content"
            aria-label={label}
            ref={(el) => {
              if (!el) return
              const update = () => place(el, compact ? "compact" : wide ? "wide" : "normal")
              update()
              window.addEventListener("resize", update)
              return () => window.removeEventListener("resize", update)
            }}
            className="pointer-events-auto fixed bottom-0 z-50 flex translate-y-(--drawer-swipe-movement-y) flex-col overflow-y-auto overscroll-contain rounded-t-2xl border border-b-0 bg-popover pb-[env(safe-area-inset-bottom)] md:rounded-2xl md:border-b md:pb-0 md:fade-in-0 md:zoom-in-[0.98] md:slide-in-from-bottom-4 md:data-ending-style:opacity-0 text-sm text-popover-foreground shadow-2xl animate-in duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] slide-in-from-bottom transition-transform data-ending-style:translate-y-full data-swiping:transition-none motion-reduce:animate-none motion-reduce:transition-none"
          >
            {/* Title bar: grab handle (phones), title (+ actions, ⋯) left, close right; stays on top while the content scrolls. */}
            <div className={cn("sticky top-0 z-30 bg-popover/95 backdrop-blur", (header || closeButton) && "border-b")}>
              <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-foreground/30 md:hidden" />
              {(header || closeButton) && (
                <div className="flex items-start gap-3 px-6 py-4">
                  <div className="min-w-0 flex-1">{header}</div>
                  {closeButton && (
                    <Drawer.Close render={<Button variant="ghost" size="icon-sm" className="-mr-2 shrink-0" />}>
                      <XIcon />
                      <span className="sr-only">{t("common.close")}</span>
                    </Drawer.Close>
                  )}
                </div>
              )}
            </div>
            <div className={cn("flex w-full flex-1 flex-col", compact ? "max-w-xl" : wide ? "max-w-6xl" : "max-w-3xl")}>{children}</div>
          </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.VirtualKeyboardProvider>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

export const ContentSheetTitle = Drawer.Title
export const ContentSheetDescription = Drawer.Description
export const ContentSheetClose = Drawer.Close
