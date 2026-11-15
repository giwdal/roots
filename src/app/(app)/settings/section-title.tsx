"use client"

import { usePathname } from "next/navigation"
import { TopbarCrumbs } from "@/components/topbar-crumbs"
import { useT } from "@/i18n/client"

// Where you are in the settings, in the top bar like every page: "Einstellungen › Team" (the sections are in the
// navigation beside the page). The page keeps an h1 for screen readers only.
export function SettingsTitle() {
  const t = useT()
  const key = /\/settings\/([a-z]+)/.exec(usePathname())?.[1]
  const section = key && t.has(`settings.tabs.${key}`) ? t.dynamic(`settings.tabs.${key}`) : null
  return (
    <>
      <TopbarCrumbs items={section ? [{ href: "/settings/profile", label: t("settings.title") }, { label: section }] : [{ label: t("settings.title") }]} />
      <h1 className="sr-only">{section ?? t("settings.title")}</h1>
    </>
  )
}
