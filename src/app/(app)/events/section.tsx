import Link from "next/link"
import { PlusCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** One section of a record page (docs/design/app.md › Look): small heading, content, a divider above the next one. */
export function Section({ id, title, description, action, className, children }: { id?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={cn("grid scroll-mt-20 content-start gap-3 border-t pt-5 first:border-t-0 first:pt-0", className)}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <h2 id={id ? `${id}-h` : undefined} className="text-sm font-medium">
            {title}
          </h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The quiet "+ Hinzufügen" row at the end of a list. */
export function AddLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm text-[var(--link)] hover:underline">
      <PlusCircleIcon className="size-4" /> {children}
    </Link>
  )
}
