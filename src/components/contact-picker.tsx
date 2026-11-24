"use client"

import { useState, useTransition } from "react"
import { Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { quickCreateContact, searchContacts } from "@/app/(app)/contacts/search"
import { Label } from "@/components/ui/label"
import { ContentSheet, ContentSheetTitle } from "@/components/content-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RecordPicker } from "@/components/record-picker"
import { useT } from "@/i18n/client"

type Option = { id: string; label: string; detail: string }

/** Pick one contact by searching on the server (works for any number of contacts). Posts the id as `name`. */
export function ContactPicker({
  name,
  label,
  initial,
  placeholder,
  onChange,
  noCreate,
}: {
  name: string
  label: string
  initial?: Option | null
  placeholder?: string
  onChange?: (picked: Option | null) => void
  noCreate?: boolean // search only (the form creates contacts itself)
}) {
  const t = useT()
  const [creating, setCreating] = useState<string | null>(null)
  const [created, setCreated] = useState<Option | null>(null)
  return (
    <>
      <RecordPicker
        key={created?.id}
        name={name}
        label={label}
        search={searchContacts}
        initial={created ?? initial}
        placeholder={placeholder}
        onChange={(o) => onChange?.(o ? { detail: "", ...o } : null)}
        createLabel={noCreate ? undefined : (q) => (q ? t("contacts.quickCreateNamed", { name: q }) : t("contacts.quickCreate"))}
        onCreate={noCreate ? undefined : setCreating}
      />
      {creating !== null && (
        <QuickCreate
          initial={creating}
          onClose={() => setCreating(null)}
          onCreated={(o) => {
            setCreated(o)
            onChange?.(o)
          }}
        />
      )}
    </>
  )
}

// Side panel with the basic contact fields. Not a <form>: it is rendered inside the caller's form (portal or not,
// React would bubble the submit), so it saves via a button. More fields later on the contact page.
function QuickCreate({ initial, onClose, onCreated }: { initial: string; onClose: () => void; onCreated: (o: Option) => void }) {
  const t = useT()
  const [first, ...rest] = initial.includes("@") ? [""] : initial.split(/\s+/)
  const [v, setV] = useState({ first_name: first ?? "", last_name: rest.join(" "), email: initial.includes("@") ? initial : "", phone: "", company: "" })
  const [saving, start] = useTransition()
  const save = () =>
    start(async () => {
      const r = await quickCreateContact(v)
      if ("error" in r) return void toast.error(r.error)
      toast.success(t("contacts.created"))
      onCreated(r.option)
      onClose()
    })
  const field = (key: keyof typeof v, label: string, type = "text") => (
    <div className="grid gap-2">
      <Label htmlFor={`qc-${key}`}>{label}</Label>
      <Input
        id={`qc-${key}`}
        type={type}
        value={v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            save()
          }
        }}
      />
    </div>
  )
  return (
    <ContentSheet label={t("contacts.new")} onClose={() => {}} onClosed={onClose} header={<ContentSheetTitle className="text-base font-semibold">{t("contacts.new")}</ContentSheetTitle>}>
      <div className="grid gap-4 px-6 pt-6 sm:grid-cols-2">
        {field("first_name", t("contacts.firstName"))}
        {field("last_name", t("contacts.lastName"))}
        <div className="sm:col-span-2">{field("email", t("contacts.email"), "email")}</div>
        {field("phone", t("contacts.phone"), "tel")}
        {field("company", t("contacts.company"))}
      </div>
      <div className="px-6 pt-4 pb-8">
        <Button type="button" onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving && <Loader2Icon className="animate-spin" />} {t("contacts.quickSave")}
        </Button>
      </div>
    </ContentSheet>
  )
}
