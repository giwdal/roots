"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { parseTime } from "@/lib/date-input"
import { cn } from "@/lib/utils"

/**
 * A time of day, 24 h, typed ("18", "1830", "18.30" → "18:30") in every browser: native time inputs follow the
 * browser's language (AM/PM). Posts `name` as "HH:MM" like a native time input.
 */
export function TimeInput({ name, id, defaultValue = "", required, disabled, className, ...rest }: { name: string; id?: string; defaultValue?: string; required?: boolean; disabled?: boolean; className?: string; "aria-label"?: string }) {
  const [value, setValue] = useState(defaultValue.slice(0, 5))
  const [text, setText] = useState(defaultValue.slice(0, 5))
  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Input
        id={id}
        inputMode="numeric"
        placeholder="HH:MM"
        value={text}
        required={required}
        disabled={disabled}
        aria-label={rest["aria-label"]}
        autoComplete="off"
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const tm = parseTime(text)
          if (!tm) return setText(value)
          setText(tm)
          setValue(tm)
        }}
        className={cn("w-20 text-center tabular-nums", className)}
      />
    </>
  )
}
