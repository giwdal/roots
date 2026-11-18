"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"

/**
 * A setting that takes effect at once (patterns.md §2): flips, saves through `action(on)` (a bound server action),
 * flips back with a toast when saving failed. `confirmOn` / `confirmOff`: a ConfirmHost question before switching on /
 * off (an automation that starts acting, AI apps that get cut off).
 */
export function ActionSwitch({ checked, label, action, confirmOn, confirmOff, id, disabled, refresh = true }: { checked: boolean; label: string; action: (on: boolean) => Promise<{ error?: string } | void>; confirmOn?: string; confirmOff?: string; id?: string; disabled?: boolean; refresh?: boolean }) {
  const [on, setOn] = useState(checked)
  const [pending, start] = useTransition()
  const router = useRouter()
  const ask = on ? confirmOff : confirmOn
  return (
    <Switch
      id={id}
      checked={on}
      disabled={disabled || pending}
      aria-label={label}
      data-confirm={ask}
      onCheckedChange={(next) => {
        setOn(next)
        start(async () => {
          const r = await action(next)
          if (r?.error) {
            setOn(!next)
            toast.error(r.error)
          } else if (refresh) router.refresh()
        })
      }}
    />
  )
}
