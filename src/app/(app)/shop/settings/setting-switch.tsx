"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import { setShopSwitch } from "../actions"

/** A shop setting that takes effect at once: flips, saves, and flips back with a toast if saving failed. */
export function SettingSwitch({ name, checked, label, id }: { name: string; checked: boolean; label: string; id?: string }) {
  const [on, setOn] = useState(checked)
  const [pending, start] = useTransition()
  return (
    <Switch
      id={id}
      checked={on}
      disabled={pending}
      aria-label={label}
      onCheckedChange={(next) => {
        setOn(next)
        start(async () => {
          const r = await setShopSwitch(name, next)
          if (r.error) {
            setOn(!next)
            toast.error(r.error)
          }
        })
      }}
    />
  )
}
