"use client"

import { useState } from "react"
import { InfoTip, TipLabel } from "@/components/info-tip"
import { TypedInput } from "@/components/typed-input"
import { useT } from "@/i18n/client"

/** "Preis selbst wählen": the suggested price only shows (indented below) while it is ticked. */
export function NypFields({ on, suggested, disabled }: { on: boolean; suggested: string; disabled?: boolean }) {
  const t = useT()
  const [nyp, setNyp] = useState(on)
  return (
    <div className="grid content-start gap-3">
      <div className="flex items-center gap-1">
        <label className="flex min-h-8 items-center gap-2 text-sm">
          <input type="checkbox" name="name_your_price" value="1" checked={nyp} onChange={(e) => setNyp(e.target.checked)} disabled={disabled} className="size-4 accent-primary" />
          {t("store.nameYourPrice")}
        </label>
        <InfoTip label={t("store.nameYourPrice")}>{t("store.nameYourPriceHint")}</InfoTip>
      </div>
      {nyp && (
        <div className="grid gap-2 pl-6">
          <TipLabel htmlFor="p-suggested" tip={t("store.suggestedPriceHint")}>
            {t("store.suggestedPrice")}
          </TipLabel>
          <TypedInput kind="money" id="p-suggested" name="suggested" defaultValue={suggested} disabled={disabled} />
        </div>
      )}
    </div>
  )
}
