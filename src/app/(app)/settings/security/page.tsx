import Link from "next/link"
import { updatePassword } from "@/app/account/actions"
import { PasswordFields } from "@/app/account/profile-forms"
import { Notice } from "@/components/notice"
import { Passkeys } from "@/components/passkeys"
import { SaveBar } from "@/components/save-bar"
import { RowGroup, SettingRow } from "@/components/section"
import { Button } from "@/components/ui/button"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { param } from "@/lib/url"

// Du › Sicherheit: how this account signs in — password (changed in a small sheet) and passkeys.
export default async function SecuritySettings({ searchParams }: PageProps<"/settings/security">) {
  const [t, sp] = await Promise.all([getT(), searchParams])
  const changing = param(sp, "edit") === "password"
  return (
    <div className="grid gap-8">
      <Notice error={changing ? undefined : param(sp, "error")} ok={param(sp, "ok")} />
      <RowGroup id="password">
        <SettingRow label={t("account.password")} hint={t("account.passwordHint")}>
          <Button render={<Link href="/settings/security?edit=password" scroll={false} />} nativeButton={false} size="sm" variant="outline">
            {t("account.changePassword")}
          </Button>
        </SettingRow>
      </RowGroup>
      <RowGroup id="passkeys" title={t("passkeys.title")} description={t("passkeys.hint")}>
        <div className="p-4">
          <Passkeys />
        </div>
      </RowGroup>
      {changing && (
        <UrlSheet params={["edit"]} title={t("account.changePassword")} compact>
          <form action={updatePassword} className="grid gap-4">
            <Notice error={param(sp, "error")} />
            <input type="hidden" name="back" value="/settings/security" />
            <input type="hidden" name="retry" value="/settings/security?edit=password" />
            <PasswordFields autoFocus />
            <SaveBar label={t("account.changePassword")} always />
          </form>
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
