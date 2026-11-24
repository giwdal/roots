"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ContentSheet, ContentSheetClose, ContentSheetDescription, ContentSheetTitle } from "@/components/content-sheet"
import { useT } from "@/i18n/client"

/**
 * "Wirklich?" before destructive submits. Any submit button with data-confirm="<message key>" (gets { count } = ticked
 * "ids" of its form, for bulk bars) is held back until the dialog is confirmed, then submitted again with the same
 * button, so server actions and formAction work unchanged. Other elements with data-confirm (client buttons, links)
 * have their click held back the same way. Mounted once in <AppShell>.
 */
// Questions before a wanted step (money in, sending, issuing, approving) get a normal button; everything else
// (deleting, cancelling, refunding, revoking) the red one.
const POSITIVE = /\.confirm(Paid|BulkPaid|Collected|Send|Schedule|Issue\w*|Approve\w*|Renew|Remind\w*|BulkRemind|Book|Return|Resend|Reopen|Publish|Accept\w*|TransferReceived|CashReceived|Activate|SeriesSave|Save|Grant)$/

export function ConfirmHost() {
  const t = useT()
  const [ask, setAsk] = useState<{ form: HTMLFormElement | null; button: HTMLElement; key: string; vars: { count: number; amount: string }; label: string; n: number } | null>(null)
  const passed = useRef<HTMLElement | null>(null)
  const n = useRef(0) // new key per ask so a reopened sheet mounts fresh

  useEffect(() => {
    // Capture on document runs before React's own submit handling, so stopping here keeps the action from starting.
    const onSubmit = (e: SubmitEvent) => {
      const button = e.submitter
      const key = button?.dataset.confirm
      if (!button || !key) return
      if (passed.current === button || (passed.current && !passed.current.isConnected)) return void (passed.current = null)
      e.preventDefault()
      e.stopPropagation()
      const form = e.target as HTMLFormElement
      // data-confirm-count / -amount: what the server knows (people to email, money) beyond the ticked ids.
      const count = Number(button.dataset.confirmCount ?? new FormData(form, button).getAll("ids").length)
      setAsk({ form, button, key, vars: { count, amount: button.dataset.confirmAmount ?? "" }, label: button.textContent?.trim() ?? "", n: ++n.current })
    }
    // Client buttons (type="button", onClick does the work) and links: the same question, then the click again.
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element).closest?.<HTMLElement>("[data-confirm]")
      if (!el || (el instanceof HTMLButtonElement && el.type === "submit" && el.form)) return
      if (passed.current === el) return void (passed.current = null)
      e.preventDefault()
      e.stopPropagation()
      const count = Number(el.dataset.confirmCount ?? 0)
      setAsk({ form: null, button: el, key: el.dataset.confirm!, vars: { count, amount: el.dataset.confirmAmount ?? "" }, label: el.textContent?.trim() ?? "", n: ++n.current })
    }
    document.addEventListener("submit", onSubmit, true)
    document.addEventListener("click", onClick, true)
    return () => {
      document.removeEventListener("submit", onSubmit, true)
      document.removeEventListener("click", onClick, true)
    }
  }, [])

  const confirm = () => {
    if (!ask) return
    passed.current = ask.button
    if (!ask.form) ask.button.click()
    // Menu items are gone once their menu closed; they carry no formAction/value, so a plain submit is the same.
    else if (ask.button.isConnected) ask.form.requestSubmit(ask.button)
    else ask.form.requestSubmit()
    setAsk(null)
  }

  if (!ask) return null
  const title = t.dynamic(ask.key, ask.vars)
  return (
    <ContentSheet
      compact
      key={ask.n}
      label={title}
      onClose={() => {}}
      onClosed={() => setAsk(null)}
      header={
        <>
          <ContentSheetTitle className="text-base font-semibold">{title}</ContentSheetTitle>
          {t.has(`${ask.key}Hint`) && <ContentSheetDescription className="mt-1 text-muted-foreground">{t.dynamic(`${ask.key}Hint`, ask.vars)}</ContentSheetDescription>}
        </>
      }
    >
      <div className="flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end">
        <ContentSheetClose render={<Button variant="outline" />}>{t("common.cancel")}</ContentSheetClose>
        <Button variant={POSITIVE.test(ask.key) ? "default" : "destructive"} onClick={confirm} autoFocus>
          {ask.label || t("common.confirm")}
        </Button>
      </div>
    </ContentSheet>
  )
}
