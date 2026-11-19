"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { useT } from "@/i18n/client"

const NEW = "\u0000new"

/** A loose file's folder: one of the existing folders, none, or "Neuer Ordner …" with a name field (no typos = no stray folders). */
export function FolderField({ id, folders, defaultValue }: { id: string; folders: string[]; defaultValue: string | null }) {
  const t = useT()
  const [pick, setPick] = useState(defaultValue ?? "")
  const all = defaultValue && !folders.includes(defaultValue) ? [...folders, defaultValue] : folders
  return (
    <div className="grid gap-2">
      <NativeSelect id={id} name={pick === NEW ? undefined : "folder"} value={pick} onChange={(e) => setPick(e.target.value)} className="w-full">
        <NativeSelectOption value="">{t("files.noFolder")}</NativeSelectOption>
        {all.map((f) => (
          <NativeSelectOption key={f} value={f}>
            {f}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={NEW}>{t("files.newFolder")}</NativeSelectOption>
      </NativeSelect>
      {pick === NEW && <Input name="folder" required maxLength={200} autoFocus placeholder={t("files.newFolderName")} aria-label={t("files.newFolderName")} />}
    </div>
  )
}
