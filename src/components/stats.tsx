import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * The state of a record at a glance (sold / capacity, revenue, open dues…): a row of small tiles under the header,
 * 2 per row on phones, up to 4 from sm. A tile with `href` links to the list behind the number.
 */
export function Stats({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] sm:gap-3", className)}>{children}</div>
}

export function Stat({ label, value, hint, href, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "warn" | "good" }) {
  const body = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-medium tabular-nums", tone === "warn" && "text-destructive", tone === "good" && "text-[var(--area-finance)]")}>{value}</span>
      {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
    </>
  )
  const box = "grid min-w-0 content-start gap-0.5 rounded-lg bg-muted/70 px-3 py-2.5"
  return href ? (
    <Link href={href} className={cn(box, "transition-colors hover:bg-muted")}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  )
}
