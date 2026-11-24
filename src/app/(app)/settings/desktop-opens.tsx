"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** From md the settings index is the nav beside the page: open the first section instead of an empty page. */
export function DesktopOpens({ href }: { href: string }) {
  const router = useRouter()
  useEffect(() => {
    if (matchMedia("(min-width: 768px)").matches) router.replace(href)
  }, [href, router])
  return null
}
