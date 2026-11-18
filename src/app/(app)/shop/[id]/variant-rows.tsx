"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { PackagePlusIcon, PlusCircleIcon, Trash2Icon } from "lucide-react"
import { TypedInput } from "@/components/typed-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { ImagePick } from "./image-pick"

export type VariantRow = { id: string; name: string; values: string[] | null; price: string; stock: string; left: string; image: string; active: boolean; digital: boolean; nyp: boolean; book?: string }

/**
 * The product's variants inside its one form (saved with the SaveBar): a card per variant on phones, one grid row each
 * from md. Every row posts `variant_key` + `<field>_<key>`; rows removed here are deleted on save (asked first).
 * Variants made from options can't be added by hand (the options sheet makes them).
 */
export function VariantRows({ initial, placeholderPrice, images, canAdd, disabled }: { initial: VariantRow[]; placeholderPrice: string; images: { path: string; url: string }[]; canAdd: boolean; disabled?: boolean }) {
  const t = useT()
  const box = useRef<HTMLDivElement>(null)
  const next = useRef(0)
  const [rows, setRows] = useState<(VariantRow & { key: string })[]>(() => initial.map((r) => ({ ...r, key: r.id })))
  // The SaveBar listens for change events inside the form: adding or removing a row is a change too.
  const changed = () => requestAnimationFrame(() => box.current?.dispatchEvent(new Event("change", { bubbles: true })))
  const check = (name: string, on: boolean, label: string) => (
    <label className="flex min-h-8 items-center gap-1.5 text-xs text-muted-foreground md:justify-center">
      <input type="checkbox" name={name} value="1" defaultChecked={on} disabled={disabled} className="size-4 accent-primary" />
      <span className="md:sr-only">{label}</span>
    </label>
  )

  return (
    <div ref={box} className="grid gap-2">
      <input type="hidden" name="variants_present" value="1" />
      {rows.length > 0 && (
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_5.5rem_5.5rem_2.5rem_4rem_4rem_4rem_2rem] items-center gap-2 px-2 text-xs text-muted-foreground md:grid">
          <span>{t("store.variantName")}</span>
          <span>{t("store.price")}</span>
          <span>{t("store.stock")}</span>
          <span>{t("store.leftColumn")}</span>
          <span className="sr-only">{t("store.variantImage")}</span>
          <span className="text-center">{t("store.variantActive")}</span>
          <span className="text-center">{t("store.variantDigital")}</span>
          <span className="text-center" title={t("store.nameYourPriceHint")}>
            {t("store.variantNyp")}
          </span>
          <span />
        </div>
      )}
      {rows.map((r) => {
        const f = (k: string) => `${k}_${r.key}`
        return (
          <div key={r.key} className="grid grid-cols-2 items-center gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_7rem_5.5rem_5.5rem_2.5rem_4rem_4rem_4rem_2rem] md:rounded-none md:border-0 md:border-t md:px-2 md:py-1.5">
            <input type="hidden" name="variant_key" value={r.key} />
            <input type="hidden" name={f("has_active")} value="1" />
            <input type="hidden" name={f("has_nyp")} value="1" />
            <div className="col-span-2 md:col-span-1">
              {r.values ? (
                <>
                  <input type="hidden" name={f("name")} value={r.name} />
                  <span className="font-medium">{r.values.join(" / ")}</span>
                </>
              ) : (
                <Input name={f("name")} defaultValue={r.name} required maxLength={100} placeholder={t("store.variantPlaceholder")} aria-label={t("store.variantName")} disabled={disabled} />
              )}
            </div>
            <TypedInput kind="money" name={f("price")} defaultValue={r.price} placeholder={placeholderPrice} aria-label={t("store.price")} disabled={disabled} className="w-full" />
            <TypedInput kind="number" name={f("stock")} min={0} defaultValue={r.stock} placeholder="∞" aria-label={t("store.stock")} disabled={disabled} className="w-full" />
            <span className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
              {r.left}
              {r.book && (
                <Link href={r.book} scroll={false} aria-label={t("store.lager.bookItem", { item: r.values?.join(" / ") ?? r.name })} title={t("store.lager.bookItem", { item: r.values?.join(" / ") ?? r.name })} className="grid size-8 place-items-center rounded-md hover:bg-muted">
                  <PackagePlusIcon className="size-4" />
                </Link>
              )}
            </span>
            {images.length > 0 ? <ImagePick name={f("image")} images={images} defaultValue={r.image} disabled={disabled} label={t("store.variantImage")} noneLabel={t("store.noVariantImage")} /> : <span className="max-md:hidden" />}
            <div className="col-span-2 flex flex-wrap items-center gap-x-4 md:contents">
              {check(f("active"), r.active, t("store.variantActive"))}
              {check(f("digital"), r.digital, t("store.variantDigital"))}
              {check(f("name_your_price"), r.nyp, t("store.variantNyp"))}
              {!disabled && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="ml-auto md:ml-0"
                  aria-label={t("store.deleteVariant")}
                  title={t("store.deleteVariant")}
                  data-confirm={r.id.startsWith("n") ? undefined : "store.confirmDeleteVariant"}
                  onClick={() => (setRows((x) => x.filter((y) => y.key !== r.key)), changed())}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          </div>
        )
      })}
      {canAdd && !disabled && (
        <button
          type="button"
          onClick={() => (setRows((x) => [...x, { key: `n${next.current++}`, id: `n${next.current}`, name: "", values: null, price: "", stock: "", left: "", image: "", active: true, digital: false, nyp: false }]), changed())}
          className="inline-flex min-h-8 w-fit items-center gap-1.5 text-sm text-[var(--link)] hover:underline"
        >
          <PlusCircleIcon className="size-4" /> {t("store.addVariant")}
        </button>
      )}
    </div>
  )
}
