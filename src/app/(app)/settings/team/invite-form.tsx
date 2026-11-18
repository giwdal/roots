"use client"

import { useActionState, useState } from "react"
import { Notice } from "@/components/notice"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Choice } from "@/components/choice"
import { SaveBar } from "@/components/save-bar"
import { useT } from "@/i18n/client"
import { createInvite, type InviteState } from "./actions"

export function InviteForm({ roles, defaultRoleId }: { roles: { id: string; name: string }[]; defaultRoleId?: string }) {
  const t = useT()
  const [state, action] = useActionState(createInvite, {} as InviteState)
  const [copied, setCopied] = useState(false)

  if (state.link)
    return (
      <div className="grid gap-3">
        {state.mailFailed && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{t("members.inviteMailFailed")}</p>}
        <p className="text-sm">{state.mailFailed ? t("members.sendLink", { email: state.email! }) : t("members.inviteSent", { email: state.email! })}</p>
        <Input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} aria-label={t("members.inviteLink")} />
        <Button
          type="button"
          onClick={() => navigator.clipboard.writeText(state.link!).then(() => setCopied(true))}
        >
          {copied ? t("members.copied") : t("members.copy")}
        </Button>
      </div>
    )

  return (
    <form action={action} className="grid gap-4">
      <Notice error={state.error} />
      <div className="grid gap-2">
        <Label htmlFor="invite-email">{t("members.email")}</Label>
        <Input id="invite-email" name="email" type="email" required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-role">{t("members.role")}</Label>
        <Choice id="invite-role" name="role_id" label={t("members.role")} options={roles.map((r) => ({ value: r.id, label: r.name }))} defaultValue={defaultRoleId} required />
      </div>
      <SaveBar label={t("members.sendInvite")} always />
    </form>
  )
}
