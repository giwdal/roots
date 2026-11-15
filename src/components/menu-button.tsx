"use client"

import { MenuIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"

// Phones, while the bottom bar is hidden: opens the menu sheet (<MobileMenu>).
export function MenuButton() {
  const t = useT()
  return (
    <Button variant="ghost" size="icon" aria-label={t("shell.menu")} onClick={() => document.dispatchEvent(new Event("roots:menu"))} className="-ml-1 size-9 md:hidden bar-fallback">
      <MenuIcon />
    </Button>
  )
}
