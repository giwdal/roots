import { MultiSelect } from "@/components/multi-select"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { cn } from "@/lib/utils"

export type ChoiceOption = { value: string; label: string }

/**
 * Pick one value; the control follows the number of options so every screen decides the same way:
 * ≤ 5 → segmented buttons (all visible, one tap) · 6–15 → dropdown · > 15 → search dropdown.
 * Posts `name` like a select. Not `required` → an empty choice ("–") is offered.
 */
export function Choice({ name, options, defaultValue, required, disabled, id, label, className }: { name: string; options: ChoiceOption[]; defaultValue?: string | null; required?: boolean; disabled?: boolean; id?: string; label?: string; className?: string }) {
  if (options.length <= 5)
    return (
      <SegmentGroup id={id} label={label} className={className}>
          {!required && <Segment name={name} value="" label="–" defaultChecked={!defaultValue} disabled={disabled} />}
          {options.map((o) => (
            <Segment key={o.value} name={name} value={o.value} label={o.label} defaultChecked={defaultValue === o.value} disabled={disabled} required={required} />
          ))}
      </SegmentGroup>
    )
  if (options.length <= 15)
    return (
      <NativeSelect id={id} name={name} defaultValue={defaultValue ?? ""} required={required} disabled={disabled} aria-label={label} className={cn("w-full", className)}>
        {!required && <NativeSelectOption value="">–</NativeSelectOption>}
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    )
  return <MultiSelect id={id} name={name} options={options} defaultValue={defaultValue ? [defaultValue] : []} single disabled={disabled} />
}

/** Segmented control: native radios (arrow keys, one tab stop, form posting) styled as one row of buttons. */
export function SegmentGroup({ id, label, className, children }: { id?: string; label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="radiogroup" id={id} aria-label={label} className={cn("flex h-fit w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1 has-disabled:opacity-60", className)}>
      {children}
    </div>
  )
}

/** One option of a <SegmentGroup>: uncontrolled with `defaultChecked`, controlled with `checked` + `onPick`. */
export function Segment({ name, value, label, checked, defaultChecked, onPick, disabled, required }: { name: string; value: string; label: React.ReactNode; checked?: boolean; defaultChecked?: boolean; onPick?: (value: string) => void; disabled?: boolean; required?: boolean }) {
  return (
    <label className="relative flex min-h-7 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors select-none hover:text-foreground has-checked:bg-background has-checked:font-medium has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring/50 has-disabled:cursor-default [&_svg]:size-4">
      <input type="radio" name={name} value={value} checked={checked} defaultChecked={defaultChecked} onChange={onPick && (() => onPick(value))} disabled={disabled} required={required} className="sr-only" />
      {label}
    </label>
  )
}
