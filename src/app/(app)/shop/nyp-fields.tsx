"use client"

import { useState } from "react"
import { TypedInput } from "@/components/typed-input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"

/** "Preis selbst wählen": the suggested price only shows while it is ticked. */
export function NypFields({ on, suggested, disabled }: { on: boolean; suggested: string; disabled?: boolean }) {
  const t = useT()
  const [nyp, setNyp] = useState(on)
  return (
    <div className="grid content-start gap-2 sm:col-span-2">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="name_your_price" value="1" checked={nyp} onChange={(e) => setNyp(e.target.checked)} disabled={disabled} className="mt-0.5 size-4 accent-primary" />
        <span>
          {t("store.nameYourPrice")}
          <span className="block text-xs text-muted-foreground">{t("store.nameYourPriceHint")}</span>
        </span>
      </label>
      {nyp && (
        <div className="grid gap-2 pl-6 sm:max-w-56">
          <Label htmlFor="p-suggested">{t("store.suggestedPrice")}</Label>
          <TypedInput kind="money" id="p-suggested" name="suggested" defaultValue={suggested} disabled={disabled} className="w-full" />
        </div>
      )}
    </div>
  )
}
