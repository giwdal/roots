"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ContentSheet, ContentSheetClose, ContentSheetDescription, ContentSheetTitle } from "@/components/content-sheet"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { renewInviteLink } from "./actions"

/** Open invites only store a hash, so renewing issues a fresh link (the old one stops working) and shows it to copy. */
export function InviteLink({ id }: { id: string }) {
  const t = useT()
  const [link, setLink] = useState<string>()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pending, start] = useTransition()

  const renew = () =>
    start(async () => {
      const r = await renewInviteLink(id)
      if (!r.link) return void toast.error(r.error)
      setLink(r.link)
      setCopied(false)
      setOpen(true)
    })

  const copy = () => navigator.clipboard.writeText(link!).then(() => setCopied(true))

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={renew} data-confirm="members.confirmRenew">
        {t("members.renewLink")}
      </Button>
      {open && (
        <ContentSheet
          compact
          label={t("members.renewTitle")}
          onClose={() => {}}
          onClosed={() => setOpen(false)}
          header={
            <>
              <ContentSheetTitle className="text-base font-semibold">{t("members.renewTitle")}</ContentSheetTitle>
              <ContentSheetDescription className="mt-1 text-muted-foreground">{t("members.renewText")}</ContentSheetDescription>
            </>
          }
        >
          <div className="grid gap-4 px-6 py-4">
            <Input readOnly value={link ?? ""} onFocus={(e) => e.currentTarget.select()} aria-label={t("members.inviteLink")} />
            {/* TODO: add a "Resend email" button here that mails the newly created link to the invitee. */}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={copy}>
                {copied ? t("members.copied") : t("members.copy")}
              </Button>
              <ContentSheetClose render={<Button type="button" />} onClick={copy}>
                {t("members.copyClose")}
              </ContentSheetClose>
            </div>
          </div>
        </ContentSheet>
      )}
    </>
  )
}
