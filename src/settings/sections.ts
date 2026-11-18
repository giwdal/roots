import { BellIcon, BlocksIcon, BuildingIcon, KeyRoundIcon, MapPinIcon, PlugIcon, ShieldIcon, SlidersHorizontalIcon, SparklesIcon, SquareCodeIcon, TextCursorInputIcon, UserIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { visibleNav } from "@/modules/nav"

/** One settings page: /settings/<key>, label settings.tabs.<key>; `permission` = who may change it (only they see it). */
export type SettingsSection = { key: string; icon: LucideIcon; permission?: string }

// Settings in two groups (docs/plans/ux-backlog.md F1): "Du" = the person's own, "Organisation" = the active org's.
// Area settings stay behind each area's gear (listed under Bereiche), the platform's under /admin.
export const SETTINGS_GROUPS: { key: "me" | "org"; sections: SettingsSection[] }[] = [
  {
    key: "me",
    sections: [
      { key: "profile", icon: UserIcon },
      { key: "notifications", icon: BellIcon },
      { key: "security", icon: KeyRoundIcon },
      { key: "ai", icon: SparklesIcon },
    ],
  },
  {
    key: "org",
    sections: [
      { key: "general", icon: BuildingIcon, permission: "org.settings.manage" },
      { key: "team", icon: UsersIcon, permission: "org.members.manage" },
      { key: "roles", icon: ShieldIcon, permission: "org.members.manage" },
      { key: "modules", icon: BlocksIcon, permission: "org.settings.manage" },
      { key: "areas", icon: SlidersHorizontalIcon, permission: "areas" },
      { key: "fields", icon: TextCursorInputIcon, permission: "org.settings.manage" },
      { key: "locations", icon: MapPinIcon, permission: "org.settings.manage" },
      { key: "integrations", icon: PlugIcon, permission: "org.integrations.manage" },
      { key: "api", icon: SquareCodeIcon, permission: "org.integrations.manage" },
    ],
  },
]

/**
 * The groups with the sections this person may open. `areas` = whether any area settings page is open to them
 * (Bereiche lists those; without any it is hidden).
 */
export function settingsFor(can: (perm: string) => boolean, areas: boolean) {
  return SETTINGS_GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => !s.permission || (s.permission === "areas" ? areas : can(s.permission))) })).filter((g) => g.sections.length)
}

/** Every area's settings page this person may open (the gear pages of src/modules/nav.ts), for Settings › Bereiche. */
export function areaSettings(on: (module: string) => boolean, can: (perm: string) => boolean) {
  return visibleNav(on, can).flatMap((a) => a.children.filter((c) => c.gear || c.label === "common.settings").map((c) => ({ key: a.key, label: a.label, icon: a.icon, href: c.href, page: c.label })))
}
