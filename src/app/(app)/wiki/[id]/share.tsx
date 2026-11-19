"use client"

import { useRef, useState } from "react"
import { CheckIcon, ChevronDownIcon, GlobeIcon, IdCardIcon, LinkIcon, LockIcon, Share2Icon, UsersIcon } from "lucide-react"
import { SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useT } from "@/i18n/client"
import { setVisibilityAction } from "../actions"

type Role = { id: string; label: string }

// "Teilen" (top right of a page): copy the link; writers set who may read the page (or leave it like the parent).
export function ShareButton({
  pageId,
  canManage,
  own,
  roleIds,
  inherited,
  hasParent,
  roles,
}: {
  pageId: string
  canManage: boolean
  own: string | null // the page's own setting (null = like the parent)
  roleIds: string[]
  inherited: { visibility: string; fromTitle: string | null } // what applies when `own` is null
  hasParent: boolean
  roles: Role[]
}) {
  const t = useT()
  const [choice, setChoice] = useState(own ?? (hasParent ? "" : "team"))
  const [copied, setCopied] = useState("")
  const effective = own ?? inherited.visibility
  const copy = async (what: string, url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(what)
    setTimeout(() => setCopied(""), 1500)
  }
  const Icon = { roles: LockIcon, members: IdCardIcon, public: GlobeIcon }[effective] ?? UsersIcon
  // Who may read, as one segmented choice (team · roles · members · public, or like the parent); the picked one's hint below.
  const options = [
    ...(hasParent ? [{ value: "", label: t("wiki.share.inherit"), hint: t("wiki.share.inheritHint", { what: t.dynamic(`wiki.share.short.${inherited.visibility}`), page: inherited.fromTitle ?? t("wiki.share.default") }) }] : []),
    { value: "team", label: t("wiki.share.team"), hint: t("wiki.share.teamHint") },
    { value: "roles", label: t("wiki.share.roles"), hint: t("wiki.share.rolesHint") },
    { value: "members", label: t("wiki.share.members"), hint: t("wiki.share.membersHint") },
    { value: "public", label: t("wiki.share.public"), hint: t("wiki.share.publicHint") },
  ]

  const form = useRef<HTMLFormElement>(null)
  const pick = (v: string) => {
    setChoice(v)
    // A choice takes effect at once; "Nur bestimmte Rollen" waits for the roles to be ticked.
    if (v !== "roles") setTimeout(() => form.current?.requestSubmit())
  }
  const ChoiceIcon = { roles: LockIcon, members: IdCardIcon, public: GlobeIcon, team: UsersIcon }[choice || inherited.visibility] ?? UsersIcon
  const current = options.find((o) => o.value === choice)

  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" size="sm" variant="outline" />}>
        {effective === "team" ? <Share2Icon /> : <Icon />} {t("wiki.share.button")}
      </PopoverTrigger>
      <PopoverContent sheet title={t("wiki.share.button")} align="end" className="grid w-96 gap-4 p-0 max-md:pb-4">
        {/* Like Google Docs / Claude: one "general access" row (icon + who), a hint, the link at the bottom. */}
        <form ref={form} action={setVisibilityAction} className="grid gap-3 px-4 pt-4">
          <input type="hidden" name="id" value={pageId} />
          <input type="hidden" name="visibility" value={choice} />
          <p className="text-xs font-medium text-muted-foreground">{t("wiki.share.who")}</p>
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
              <ChoiceIcon className="size-4" />
            </span>
            <div className="grid min-w-0 flex-1 gap-0.5">
              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2 w-fit max-w-full justify-start font-medium" />}>
                    <span className="truncate">{current?.label}</span> <ChevronDownIcon className="opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" title={t("wiki.share.who")} className="min-w-64">
                    {options.map((o) => (
                      <DropdownMenuItem key={o.value || "inherit"} onClick={() => pick(o.value)} className="items-start">
                        <span className="grid flex-1">
                          <span>{o.label}</span>
                          <span className="text-xs text-muted-foreground">{o.hint}</span>
                        </span>
                        <CheckIcon className={o.value === choice ? "mt-0.5" : "invisible"} />
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="py-1 text-sm font-medium">{current?.label}</span>
              )}
              <span className="text-xs text-muted-foreground">{current?.hint}</span>
            </div>
          </div>
          {choice === "roles" && (
            <fieldset className="grid gap-2 rounded-lg border p-3" disabled={!canManage}>
              <legend className="sr-only">{t("wiki.share.roles")}</legend>
              {roles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="role_ids" value={r.id} defaultChecked={roleIds.includes(r.id)} className="size-4 accent-primary" />
                  {r.label}
                </label>
              ))}
              {canManage && (
                <SubmitButton size="sm" className="justify-self-end">
                  {t("common.save")}
                </SubmitButton>
              )}
            </fieldset>
          )}
        </form>
        <div className="flex items-center gap-3 border-t px-4 py-3">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            {effective === "public" || effective === "members" ? t.dynamic(`wiki.share.oneLink.${effective}`) : t.dynamic(`wiki.share.short.${effective}`)}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={() => copy("app", `${window.location.origin}${window.location.pathname}`)}>
            {copied === "app" ? <CheckIcon /> : <LinkIcon />} {copied === "app" ? t("wiki.share.copied") : t("wiki.share.copy")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
