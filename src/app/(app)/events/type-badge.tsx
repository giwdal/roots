import { Badge } from "@/components/ui/badge"
import { DOT } from "@/projects/fields"

/** An event's type as a small badge with its colour dot (nothing without a type). */
export function TypeBadge({ type }: { type?: { name: string; color: string | null } | null }) {
  if (!type) return null
  return (
    <Badge variant="outline" className="gap-1.5">
      <span className="size-2 rounded-full" style={{ background: type.color ? DOT[type.color] : "var(--muted-foreground)" }} aria-hidden />
      {type.name}
    </Badge>
  )
}
