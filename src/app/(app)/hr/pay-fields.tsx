"use client"

import { useState } from "react"
import { Segment, SegmentGroup } from "@/components/choice"
import { TypedInput } from "@/components/typed-input"
import { Label } from "@/components/ui/label"

/** Vergütung as segments; only the amount that belongs to it shows (Stundenlohn or Monatsgehalt). */
export function PayFields({ labels, options, defaultType, hourly, monthly, disabled }: { labels: { pay: string; hourly: string; monthly: string }; options: { value: string; label: string }[]; defaultType: string; hourly: string; monthly: string; disabled?: boolean }) {
  const [type, setType] = useState(defaultType)
  return (
    <>
      <div className="grid basis-full content-start gap-2">
        <Label htmlFor="emp-pay_type">{labels.pay}</Label>
        <SegmentGroup id="emp-pay_type" label={labels.pay}>
          {options.map((o) => (
            <Segment key={o.value} name="pay_type" value={o.value} label={o.label} defaultChecked={o.value === defaultType} onPick={setType} disabled={disabled} required />
          ))}
        </SegmentGroup>
      </div>
      {/* The other amount stays in the form (hidden), so switching back and forth keeps what was typed. */}
      <div className={type === "hourly" ? "grid content-start gap-2" : "hidden"}>
        <Label htmlFor="emp-hourly_rate">{labels.hourly}</Label>
        <TypedInput kind="money" id="emp-hourly_rate" name="hourly_rate" disabled={disabled} defaultValue={hourly} />
      </div>
      <div className={type === "monthly" ? "grid content-start gap-2" : "hidden"}>
        <Label htmlFor="emp-monthly_salary">{labels.monthly}</Label>
        <TypedInput kind="money" id="emp-monthly_salary" name="monthly_salary" disabled={disabled} defaultValue={monthly} />
      </div>
    </>
  )
}
