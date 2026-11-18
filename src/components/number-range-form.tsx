import { SubmitButton } from "@/components/submit-button"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import { previewNumber, RANGE_KINDS, type RangeKind } from "@/lib/number-ranges"

type Range = { format: string; next_number: number; yearly_reset: boolean } | null | undefined

// One number range (invoice, quote, member…): format with placeholders, next number, yearly reset, preview.
// The module's server action saves it (permission of that module).
export function NumberRangeForm({ t, kind, range, label, action }: { t: T; kind: RangeKind; range: Range; label: string; action: (fd: FormData) => Promise<void> }) {
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="kind" value={kind} />
      <NumberRangeFields t={t} kind={kind} range={range} label={label}>
        <SubmitButton variant="outline" size="sm">
          {t("common.save")}
        </SubmitButton>
      </NumberRangeFields>
    </form>
  )
}

/**
 * The fields of one number range inside a bigger form (saved with its SaveBar). `suffix` makes the names unique when
 * a form holds several ranges (`format_invoice`, `next_number_invoice`, `yearly_reset_invoice`).
 */
export function NumberRangeFields({ t, kind, range, label, suffix = "", children }: { t: T; kind: RangeKind; range: Range; label: string; suffix?: string; children?: React.ReactNode }) {
  const format = range?.format ?? RANGE_KINDS[kind].fallback
  const next = range?.next_number ?? 1
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto_auto] sm:items-end">
        <div className="grid gap-2">
          <Label htmlFor={`n-${kind}`}>{label}</Label>
          <Input id={`n-${kind}`} name={`format${suffix}`} defaultValue={format} required maxLength={60} className="font-mono" aria-describedby={`n-${kind}-help`} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`nn-${kind}`}>{t("numbers.next")}</Label>
          <TypedInput kind="number" id={`nn-${kind}`} name={`next_number${suffix}`} min={1} defaultValue={String(next)} className="w-full" />
        </div>
        <label className="flex min-h-9 items-center gap-2 text-sm">
          <input type="checkbox" name={`yearly_reset${suffix}`} value="1" defaultChecked={range?.yearly_reset ?? RANGE_KINDS[kind].yearlyReset} className="size-4 accent-primary" />
          {t("numbers.yearlyReset")}
        </label>
        {children}
      </div>
      <p id={`n-${kind}-help`} className="text-xs text-muted-foreground">
        {t("numbers.preview", {
          example: previewNumber(format, next, new Date().toISOString().slice(0, 10), "1990-01-01"),
        })}{" "}
        · {t("numbers.help")}
      </p>
    </div>
  )
}
