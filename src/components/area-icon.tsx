import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * An area's icon on its colour tile (sidebar, phone menu, top bar, page headers): one colour per area
 * (`--area-<key>` in theme.css), so people find an area by colour before reading. Unknown keys get the neutral tile.
 */
export function AreaIcon({ area, icon: Icon, className }: { area: string; icon: LucideIcon; className?: string }) {
  return (
    <span
      aria-hidden
      data-slot="area-icon"
      className={cn("grid size-5 shrink-0 place-items-center rounded-[0.35rem] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]", className)}
      style={{ background: `linear-gradient(160deg, var(--area-${area}, var(--muted-foreground)), color-mix(in oklch, var(--area-${area}, var(--muted-foreground)) 72%, black))` }}
    >
      <Icon className="!size-[62%] !text-white" strokeWidth={2.25} />
    </span>
  )
}
