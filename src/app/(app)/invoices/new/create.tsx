"use client"

import { useEffect, useRef } from "react"
import { Loader2Icon } from "lucide-react"
import { useT } from "@/i18n/client"
import { createDocument } from "../actions"

/** Creates the draft once the page is open (a link can't post) and lands on it. */
export function CreateDraft({ kind, contact }: { kind: "invoice" | "quote"; contact?: string }) {
  const t = useT()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    const fd = new FormData()
    fd.set("kind", kind)
    if (contact) fd.set("contact", contact)
    void createDocument(fd)
  }, [kind, contact])
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2Icon className="size-4 animate-spin" /> {t(kind === "quote" ? "invoices.creatingQuote" : "invoices.creatingInvoice")}
    </p>
  )
}
