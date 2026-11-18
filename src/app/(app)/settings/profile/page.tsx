import { CheckIcon, LogOutIcon } from "lucide-react"
import { ProfileRows } from "@/app/account/profile-forms"
import { ActionsMenu, MenuSubmit } from "@/components/actions-menu"
import { Notice } from "@/components/notice"
import { Picture } from "@/components/picture"
import { AddLink, RowGroup } from "@/components/section"
import { Badge } from "@/components/ui/badge"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param } from "@/lib/url"
import { switchOrg } from "../../actions"
import { leaveOrg } from "../team/actions"

// Du › Profil: picture, name, language, look; the orgs this account belongs to (switch, leave, start another).
export default async function ProfileSettings({ searchParams }: PageProps<"/settings/profile">) {
  const [ctx, t, sp] = await Promise.all([getContext(), getT(), searchParams])
  return (
    <div className="grid gap-8">
      <Notice error={param(sp, "error")} ok={param(sp, "ok")} />
      <ProfileRows path="/settings/profile" />
      <RowGroup id="my-orgs" title={t("account.orgs")}>
        {ctx.orgs.map((o) => {
          const current = o.id === ctx.org.id
          const body = (
            <>
              <Picture path={o.logo_path} name={o.name} size="sm" square />
              <span className="grid min-w-0 flex-1 text-left">
                <span className="truncate font-medium">{o.name}</span>
                {current && <span className="truncate text-xs text-muted-foreground">{ctx.role.name}</span>}
              </span>
            </>
          )
          return current ? (
            <div key={o.id} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
              {body}
              <Badge variant="success">
                <CheckIcon /> {t("account.currentOrg")}
              </Badge>
              <form id="leave-org" action={leaveOrg} hidden />
              <ActionsMenu>
                <MenuSubmit form="leave-org" icon={<LogOutIcon />} destructive confirm="members.confirmLeave">
                  {t("account.leaveOrg")}
                </MenuSubmit>
              </ActionsMenu>
            </div>
          ) : (
            // Another org: the row switches to it.
            <form key={o.id} action={switchOrg.bind(null, o.id)}>
              <button type="submit" className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-sm hover:bg-muted active:bg-muted">
                {body}
                <span className="text-xs text-[var(--link)]">{t("account.switchOrg")}</span>
              </button>
            </form>
          )
        })}
        <div className="px-4 py-2">
          <AddLink href="/onboarding?new=1">{t("shell.newOrg")}</AddLink>
        </div>
      </RowGroup>
    </div>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
