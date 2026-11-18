"use client"

import { useState } from "react"
import { Segment, SegmentGroup } from "@/components/choice"
import { TypedInput } from "@/components/typed-input"
import { Label } from "@/components/ui/label"
import { useT } from "@/i18n/client"

// Kind, value and limit of a ticket code. Unlock-only codes ("none") have neither: they open hidden ticket types,
// and how many of those exist is the type's quota.
export function CodeKindFields({ kind: initial, value, maxUses }: { kind: string; value: string; maxUses: number | null }) {
  const t = useT()
  const [kind, setKind] = useState(initial)
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="c-kind">{t("tickets.discount")}</Label>
        <SegmentGroup id="c-kind" label={t("tickets.discount")}>
          {(["percent", "amount", "none"] as const).map((k) => (
            <Segment key={k} name="kind" value={k} label={t.dynamic(`tickets.kinds.${k}`)} checked={kind === k} onPick={setKind} />
          ))}
        </SegmentGroup>
      </div>
      {kind !== "none" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="c-value">{kind === "amount" ? t("tickets.codeAmount") : t("tickets.codePercent")}</Label>
            {kind === "amount" ? (
              <TypedInput key="amount" kind="money" id="c-value" name="value" defaultValue={kind === initial ? value : ""} required />
            ) : (
              <TypedInput key="percent" kind="number" id="c-value" name="value" min={1} max={100} step={1} defaultValue={kind === initial ? value : ""} placeholder="20" required />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-max">{t("tickets.maxUses")}</Label>
            <TypedInput kind="number" id="c-max" name="max_uses" min={1} step={1} defaultValue={maxUses ?? ""} placeholder="∞" />
            <p className="text-xs text-muted-foreground">{t("tickets.maxUsesHint")}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("tickets.unlockLimitHint")}</p>
      )}
    </div>
  )
}
