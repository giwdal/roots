"use client"

import { useEffect, useId, useState, useTransition } from "react"
import { Loader2Icon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { quickCreateContact, searchContacts } from "@/app/(app)/contacts/search"
import { Label } from "@/components/ui/label"
import { ContentSheet, ContentSheetTitle } from "@/components/content-sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox"
import { useT } from "@/i18n/client"

type Option = { id: string; label: string; detail: string }
const CREATE = "\u0000create"

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
  const id = useId()
  const [picked, setPicked] = useState<Option | null>(initial ?? null)
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Option[]>([])
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [creating, setCreating] = useState(false)
  const createLabel = q.trim() ? t("contacts.quickCreateNamed", { name: q.trim() }) : t("contacts.quickCreate")
  const items = noCreate ? results : [...results, { id: CREATE, label: createLabel, detail: "" }]
  const pick = (r: Option) => {
    setPicked(r)
    onChange?.(r)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const timer = setTimeout(() => start(async () => setResults(await searchContacts(q))), 200)
    return () => clearTimeout(timer)
  }, [q, open])

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">
            {picked.label}
            {picked.detail && <span className="text-muted-foreground"> · {picked.detail}</span>}
          </span>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={t("common.clear")}
            onClick={() => {
              setPicked(null)
              onChange?.(null)
            }}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <Combobox
          items={items}
          filter={null}
          itemToStringLabel={(r: Option) => r.label}
          value={null}
          onValueChange={(r: Option | null) => {
            if (!r) return
            if (r.id === CREATE) {
              setOpen(false)
              setCreating(true)
            } else pick(r)
          }}
          inputValue={q}
          onInputValueChange={setQ}
          open={open}
          onOpenChange={setOpen}
          autoHighlight
        >
          <div className="relative">
            <ComboboxInput id={id} placeholder={placeholder ?? t("common.search")} autoComplete="off" showTrigger={false} className="w-full" />
            {pending && <Loader2Icon className="absolute top-2 right-2 size-4 animate-spin text-muted-foreground" aria-hidden />}
          </div>
          <ComboboxContent>
            <ComboboxEmpty>{t("tags.noMatch")}</ComboboxEmpty>
            <ComboboxList>
              {(r: Option) =>
                r.id === CREATE ? (
                  <ComboboxItem key={r.id} value={r} className="text-primary">
                    <PlusIcon /> {r.label}
                  </ComboboxItem>
                ) : (
                  <ComboboxItem key={r.id} value={r}>
                    <span className="min-w-0 truncate">
                      {r.label}
                      {r.detail && <span className="text-muted-foreground"> · {r.detail}</span>}
                    </span>
                  </ComboboxItem>
                )
              }
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      )}
      {creating && <QuickCreate initial={q.trim()} onClose={() => setCreating(false)} onCreated={pick} />}
    </div>
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
