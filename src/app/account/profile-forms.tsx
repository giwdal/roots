import { InlineField } from "@/components/inline-field"
import { Picture } from "@/components/picture"
import { PicturePicker, PictureRemove } from "@/components/picture-picker"
import { RowGroup, SettingRow } from "@/components/section"
import { ThemeSwitch } from "@/components/theme-switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LocaleSwitcher } from "@/i18n/client"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { MIN_PASSWORD } from "@/lib/inputs"
import { patchProfile, updateAvatar } from "./actions"

// Personal settings shared by Settings › Profil / Sicherheit and the standalone /account page (no org needed).

/** Who you are: picture (tap to change), name (edited in place), email; language and look switch at once. */
export async function ProfileRows({ path }: { path: "/settings/profile" | "/account" }) {
  const session = (await getSession())!
  const t = await getT()
  const { data: profile } = await session.supabase.from("profiles").select("full_name, avatar_path").eq("id", session.userId).maybeSingle()
  return (
    <RowGroup id="profile" title={path === "/account" ? t("account.profile") : undefined}>
      <div className="flex items-center gap-4 px-4 py-3">
        <PicturePicker id="avatar" action={updateAvatar} hidden={{ back: path }} label={profile?.avatar_path ? t("common.changeImage") : t("common.upload")}>
          <Picture path={profile?.avatar_path} name={profile?.full_name || session.email} size="lg" />
        </PicturePicker>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <InlineField action={patchProfile} id={session.userId} field="full_name" value={profile?.full_name ?? null} label={t("account.name")} />
          <span className="truncate text-xs text-muted-foreground">{session.email}</span>
          {profile?.avatar_path && <PictureRemove action={updateAvatar} hidden={{ back: path }} label={t("common.removeImage")} />}
        </div>
      </div>
      <SettingRow label={t("account.language")}>
        <LocaleSwitcher />
      </SettingRow>
      <SettingRow label={t("account.theme")}>
        <ThemeSwitch />
      </SettingRow>
    </RowGroup>
  )
}

/** The new password twice (the form around it posts to updatePassword with `back` and `retry`). */
export async function PasswordFields({ autoFocus }: { autoFocus?: boolean }) {
  const t = await getT()
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="password">{t("account.newPassword")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} autoFocus={autoFocus} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="repeat">{t("account.repeatPassword")}</Label>
        <Input id="repeat" name="repeat" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD} />
      </div>
    </>
  )
}
