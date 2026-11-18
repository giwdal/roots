import { Badge } from "@/components/ui/badge"
import type { T } from "@/i18n/translate"

type Variant = "success" | "warning" | "secondary" | "outline"

// Status colours (docs/design/patterns.md §3): live = success, waiting for someone = warning, draft / done = neutral.
const FORM: Record<string, Variant> = { published: "success", draft: "secondary", closed: "outline" }
const SUB: Record<string, Variant> = { new: "warning", accepted: "success", rejected: "secondary" }

/** A form's state (Entwurf, Veröffentlicht, Geschlossen). */
export function FormBadge({ t, status }: { t: T; status: string }) {
  return <Badge variant={FORM[status] ?? "secondary"}>{t.dynamic(`forms.statuses.${status}`)}</Badge>
}

/** A submission's state (Neu, Angenommen, Abgelehnt). */
export function SubmissionBadge({ t, status }: { t: T; status: string }) {
  return <Badge variant={SUB[status] ?? "secondary"}>{t.dynamic(`forms.subStatus.${status}`)}</Badge>
}
