import { APP_HOME, param } from "@/lib/url"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Notice } from "@/components/notice"
import { RowGroup } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import { getSession } from "@/lib/context"
import { updatePassword } from "./actions"
import { PasswordFields, ProfileRows } from "./profile-forms"

// Standalone profile page: password reset lands here (?reset=1), and it works for people without an org.
// Inside the App the same rows live under Settings › Profil and Sicherheit.
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  if (!(await getSession())) redirect("/login?next=/account")
  const t = await getT()
  const sp = await searchParams
  const resetting = param(sp, "reset") === "1"
  return (
    <main className="mx-auto grid w-full max-w-md gap-6 px-4 py-10">
      <div className="grid gap-1">
        <Link href={APP_HOME} className="text-sm text-muted-foreground underline underline-offset-4">
          {t("account.back")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold">{t("account.title")}</h1>
      </div>
      <Notice error={param(sp, "error")} ok={param(sp, "ok") ?? (resetting ? t("account.resetHint") : undefined)} />
      <ProfileRows path="/account" />
      <RowGroup id="password" title={t("account.password")}>
        <form action={updatePassword} className="grid gap-4 p-4">
          <input type="hidden" name="back" value="/account" />
          <PasswordFields autoFocus={resetting} />
          <SubmitButton className="justify-self-start">{t("account.changePassword")}</SubmitButton>
        </form>
      </RowGroup>
    </main>
  )
}

// Reads session/URL at request time; no static shell needed yet (see AGENTS.md › Cache Components).
export const instant = false
