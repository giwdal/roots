"use client"

import { usePathname } from "next/navigation"
import { appRoute } from "@/lib/url"

/** A hidden `back` field with the current App path, for forms in layouts (which don't know the sub-page they show). */
export function HereInput() {
  return <input type="hidden" name="back" value={appRoute(usePathname())} />
}
