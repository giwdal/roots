"use client"

import { useState } from "react"
import { RecordPicker, type PickerOption } from "@/components/record-picker"
import { useT } from "@/i18n/client"
import { searchArtists } from "./actions"

// The slot's artist: search the org's artists, or type a new name ("„…“ neu anlegen" → created on save as `new_artist`).
export function ArtistField({ initial }: { initial: PickerOption | null }) {
  const t = useT()
  const [fresh, setFresh] = useState("")
  const [base, setBase] = useState(initial)
  return (
    <>
      <RecordPicker
        key={`${fresh}|${base?.id ?? ""}`}
        name="artist"
        label={t("lineup.artist")}
        search={searchArtists}
        initial={fresh ? { id: "", label: fresh, detail: t("lineup.newArtistBadge") } : base}
        placeholder={t("lineup.searchArtist")}
        createLabel={(q) => (q ? t("lineup.createArtist", { name: q }) : t("lineup.typeNewArtist"))}
        onCreate={(q) => q && setFresh(q)}
        onChange={(p) => {
          if (p) return
          setFresh("")
          setBase(null)
        }}
      />
      <input type="hidden" name="new_artist" value={fresh} />
    </>
  )
}
