import Link from "next/link"
import { ChevronRightIcon, PlusCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/** One section of a record page (docs/design/app.md › Look): small heading, content, a divider above the next one. */
export function Section({ id, title, description, action, className, children }: { id?: string; title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className={cn("grid scroll-mt-20 grid-cols-[minmax(0,1fr)] content-start gap-3 border-t pt-5 first:border-t-0 first:pt-0", className)}>
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

/** A settings group (docs/design/patterns.md §2): small heading, then a rounded box of rows. */
export function RowGroup({ id, title, description, children }: { id?: string; title?: React.ReactNode; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="grid scroll-mt-20 grid-cols-[minmax(0,1fr)] gap-2">
      {(title || description) && (
        <div className="grid gap-0.5 px-1">
          {title && <h3 className="text-sm font-medium">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="divide-y rounded-xl border">{children}</div>
    </section>
  )
}

/** One setting: label + one-line hint left, the control right (below on narrow phones). */
export function SettingRow({ label, hint, htmlFor, children }: { label: React.ReactNode; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="grid min-w-0 flex-1 basis-48 gap-0.5">
        <label htmlFor={htmlFor} className="text-sm">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex max-w-full shrink-0 items-center">{children}</div>
    </div>
  )
}

/** "Mehr Angaben": rarely needed fields folded away (still posted with the form). `open` when one of them has a value. */
export function MoreDetails({ label, open, children }: { label: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  return (
    <details className="group grid gap-6" open={open}>
      <summary className="inline-flex min-h-8 w-fit cursor-pointer list-none items-center gap-1.5 text-sm text-[var(--link)] select-none hover:underline [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" aria-hidden /> {label}
      </summary>
      <div className="mt-6 grid gap-6">{children}</div>
    </details>
  )
}
