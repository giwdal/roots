import Link from "next/link"
import { Choice } from "@/components/choice"
import { TipLabel } from "@/components/info-tip"
import { FormCard } from "@/components/page"
import { RichTextEditor } from "@/components/rich-text-editor"
import { SaveBar } from "@/components/save-bar"
import { MoreDetails } from "@/components/section"
import { TypedInput } from "@/components/typed-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { T } from "@/i18n/translate"
import type { Tables } from "@/lib/supabase/types"
import { PRODUCT_KINDS, TAX_RATES } from "@/shop/fields"
import { priceInput } from "@/tickets/price"
import { toLocalInput } from "@/lib/time"
import { saveProduct } from "./actions"
import { NypFields } from "./nyp-fields"

type P = Tables<"products"> | null | undefined

/** Name, price + VAT in one row, name your price, kind. */
export function ProductFields({ t, p, small, disabled }: { t: T; p?: P; small?: boolean; disabled?: boolean }) {
  return (
    <>
      <div className="grid max-w-xl content-start gap-2">
        <Label htmlFor="p-name">{t("store.productName")}</Label>
        <Input id="p-name" name="name" required maxLength={200} defaultValue={p?.name ?? ""} disabled={disabled} placeholder={t("store.productNamePlaceholder")} />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid content-start gap-2">
          <Label htmlFor="p-price">{small ? t("store.price") : t("store.priceGross")}</Label>
          <TypedInput kind="money" id="p-price" name="price" required defaultValue={p ? priceInput(p.price_cents) : ""} disabled={disabled} />
        </div>
        {small ? (
          // Kleinunternehmer: no VAT anywhere, so no rate to pick; the stored rate only applies once they switch.
          <div className="grid content-start gap-2">
            <input type="hidden" name="tax_rate" value={String(p?.tax_rate ?? 19)} />
            <TipLabel tip={t("store.smallBusinessNoVat")}>{t("store.taxRate")}</TipLabel>
            <p className="flex h-(--control) items-center gap-3 text-sm">
              {t("store.noVat")}
              <Link href="/invoices/settings" className="text-[var(--link)] hover:underline">
                {t("store.smallBusinessChange")}
              </Link>
            </p>
          </div>
        ) : (
          <div className="grid content-start gap-2">
            <Label htmlFor="p-tax">{t("store.taxRate")}</Label>
            <Choice id="p-tax" name="tax_rate" required label={t("store.taxRate")} defaultValue={String(p?.tax_rate ?? 19)} disabled={disabled} options={TAX_RATES.map((r) => ({ value: String(r), label: `${r} %` }))} />
          </div>
        )}
      </div>
      <NypFields on={p?.name_your_price ?? false} suggested={p?.suggested_cents != null ? priceInput(p.suggested_cents) : ""} disabled={disabled} />
      <div className="grid content-start gap-2">
        <Label htmlFor="p-kind">{t("store.kind")}</Label>
        <Choice id="p-kind" name="kind" required label={t("store.kind")} defaultValue={p?.kind ?? "physical"} disabled={disabled} options={PRODUCT_KINDS.map((k) => ({ value: k, label: t.dynamic(`store.kinds.${k}`) }))} />
      </div>
    </>
  )
}

/** Stock (only without variants: with variants every row has its own). */
export function StockField({ t, p, disabled }: { t: T; p?: P; disabled?: boolean }) {
  return (
    <div className="grid content-start gap-2">
      <TipLabel htmlFor="p-stock" tip={t("store.stockHint")}>
        {t("store.stock")}
      </TipLabel>
      <TypedInput kind="number" id="p-stock" name="stock" min={0} defaultValue={p?.stock ?? ""} placeholder={t("store.unlimited")} disabled={disabled} />
    </div>
  )
}

/** The rarely needed rest, behind "Mehr Angaben": release date, max per order, category, address, video. */
export function MoreFields({ t, p, disabled }: { t: T; p?: P; disabled?: boolean }) {
  return (
    <>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid content-start gap-2">
          <TipLabel htmlFor="p-release" tip={t("store.releaseHint")}>
            {t("store.releaseOn")}
          </TipLabel>
          <TypedInput kind="date" id="p-release" name="release_on" defaultValue={p?.release_at ? toLocalInput(p.release_at).slice(0, 10) : ""} disabled={disabled} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="p-max">{t("store.maxPerOrder")}</Label>
          <TypedInput kind="number" id="p-max" name="max_per_order" min={1} max={100} defaultValue={p?.max_per_order ?? 10} disabled={disabled} />
        </div>
      </div>
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="p-category">{t("store.category")}</Label>
          <Input id="p-category" name="category" maxLength={60} defaultValue={p?.category ?? ""} disabled={disabled} placeholder={t("store.categoryPlaceholder")} />
        </div>
        <div className="grid content-start gap-2">
          <Label htmlFor="p-slug">{t("store.slug")}</Label>
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">/shop/</span>
            <Input id="p-slug" name="slug" maxLength={80} defaultValue={p?.slug ?? ""} disabled={disabled} placeholder={t("store.slugPlaceholder")} />
          </div>
        </div>
      </div>
      <div className="grid gap-2">
        <TipLabel htmlFor="p-video" tip={t("store.videoHint")}>
          {t("store.video")}
        </TipLabel>
        <TypedInput kind="url" id="p-video" name="video_url" defaultValue={p?.video_url ?? ""} disabled={disabled} placeholder="https://youtube.com/watch?v=…" />
      </div>
    </>
  )
}

/** Whether "Mehr Angaben" starts open: one of its fields differs from the default. */
export const moreSet = (p: P) => !!p && (!!p.release_at || p.max_per_order !== 10 || !!p.category || !!p.video_url)

/** The description shown on the product page in the shop. */
export function DescriptionField({ t, p, disabled }: { t: T; p?: P; disabled?: boolean }) {
  return (
    <div className="grid max-w-2xl content-start gap-2">
      <Label htmlFor="p-description">{t("store.description")}</Label>
      {disabled ? <div className="text-sm text-muted-foreground">{p?.description ? t("store.descriptionSet") : "–"}</div> : <RichTextEditor id="p-description" name="description" defaultValue={p?.description ?? ""} />}
    </div>
  )
}

/** "Neues Produkt": starts as a draft; pictures, variants and music follow on its page, where it is published. */
export function ProductForm({ t, small }: { t: T; small?: boolean }) {
  return (
    <form action={saveProduct} className="grid gap-6">
      <input type="hidden" name="status" value="draft" />
      <FormCard id="details" title={t("store.product")}>
        <ProductFields t={t} small={small} />
      </FormCard>
      <FormCard id="sale" title={t("store.stockTitle")}>
        <StockField t={t} />
      </FormCard>
      <MoreDetails label={t("common.moreDetails")}>
        <FormCard id="page" title={t("store.productPage")}>
          <DescriptionField t={t} />
        </FormCard>
        <FormCard id="more" title={t("store.moreTitle")}>
          <MoreFields t={t} />
        </FormCard>
      </MoreDetails>
      <SaveBar label={t("store.createProduct")} always />
    </form>
  )
}
