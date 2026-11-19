import { notFound } from "next/navigation"
import { requirePerm } from "@/lib/context"

// A form's sub-views (Aufbau · Einsendungen) each render the shared header (formHeader) with their own primary.
export default async function FormLayout({ children }: LayoutProps<"/forms/[id]">) {
  const ctx = await requirePerm("forms.view")
  if (!ctx.modules.has("forms")) notFound()
  return <div className="grid min-w-0 gap-6">{children}</div>
}

export const instant = false
