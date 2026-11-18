import Link from "next/link"
import { Choice } from "@/components/choice"
import { FormCard } from "@/components/page"
import { RichTextEditor } from "@/components/rich-text-editor"
import { SaveBar } from "@/components/save-bar"
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

/** Name, price (+ name your price), VAT, kind. */
export function ProductFields({ t, p, small, disabled }: { t: T; p?: P; small?: boolean; disabled?: boolean }) {
  return (
    <>
      <div className="grid content-start gap-2">
        <Label htmlFor="p-name">{t("store.productName")}</Label>
        <Input id="p-name" name="name" required maxLength={200} defaultValue={p?.name ?? ""} disabled={disabled} placeholder={t("store.productNamePlaceholder")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Label htmlFor="p-price">{small ? t("store.price") : t("store.priceGross")}</Label>
          <TypedInput kind="money" id="p-price" name="price" required defaultValue={p ? priceInput(p.price_cents) : ""} disabled={disabled} className="w-full" />
        </div>
        {small ? (
          // Kleinunternehmer: no VAT anywhere, so no rate to pick; the stored rate only applies once they switch.
          <div className="grid content-start gap-2">
            <input type="hidden" name="tax_rate" value={String(p?.tax_rate ?? 19)} />
            <Label>{t("store.taxRate")}</Label>
            <p className="text-sm text-muted-foreground">
              {t("store.smallBusinessNoVat")}{" "}
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
        <NypFields on={p?.name_your_price ?? false} suggested={p?.suggested_cents != null ? priceInput(p.suggested_cents) : ""} disabled={disabled} />
        <div className="grid content-start gap-2">
          <Label htmlFor="p-kind">{t("store.kind")}</Label>
          <Choice id="p-kind" name="kind" required label={t("store.kind")} defaultValue={p?.kind ?? "physical"} disabled={disabled} options={PRODUCT_KINDS.map((k) => ({ value: k, label: t.dynamic(`store.kinds.${k}`) }))} />
        </div>
      </div>
    </>
  )
}

/** Stock (only without variants), max per order, release date. */
export function SaleFields({ t, p, disabled, withStock = true }: { t: T; p?: P; disabled?: boolean; withStock?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {withStock ? (
        <div className="grid content-start gap-2">
          <Label htmlFor="p-stock">{t("store.stock")}</Label>
          <TypedInput kind="number" id="p-stock" name="stock" min={0} defaultValue={p?.stock ?? ""} placeholder={t("store.unlimited")} disabled={disabled} className="w-full" />
          <p className="text-xs text-muted-foreground">{t("store.stockHint")}</p>
        </div>
      ) : (
        <input type="hidden" name="stock" value={p?.stock ?? ""} />
      )}
      <div className="grid content-start gap-2">
        <Label htmlFor="p-max">{t("store.maxPerOrder")}</Label>
        <TypedInput kind="number" id="p-max" name="max_per_order" min={1} max={100} defaultValue={p?.max_per_order ?? 10} disabled={disabled} className="w-full" />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor="p-release">{t("store.releaseOn")}</Label>
        <TypedInput kind="date" id="p-release" name="release_on" defaultValue={p?.release_at ? toLocalInput(p.release_at).slice(0, 10) : ""} disabled={disabled} />
        <p className="text-xs text-muted-foreground">{t("store.releaseHint")}</p>
      </div>
    </div>
  )
}

/** What the product page in the shop shows: description, category, address, video. */
export function PageFields({ t, p, disabled }: { t: T; p?: P; disabled?: boolean }) {
  return (
    <>
      <div className="grid content-start gap-2">
        <Label htmlFor="p-description">{t("store.description")}</Label>
        {disabled ? <div className="text-sm text-muted-foreground">{p?.description ? t("store.descriptionSet") : "–"}</div> : <RichTextEditor id="p-description" name="description" defaultValue={p?.description ?? ""} />}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="p-video">{t("store.video")}</Label>
          <TypedInput kind="url" id="p-video" name="video_url" defaultValue={p?.video_url ?? ""} disabled={disabled} placeholder="https://youtube.com/watch?v=…" />
          <p className="text-xs text-muted-foreground">{t("store.videoHint")}</p>
        </div>
      </div>
    </>
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
      <FormCard id="sale" title={t("store.saleCard")}>
        <SaleFields t={t} />
      </FormCard>
      <FormCard id="page" title={t("store.productPage")}>
        <PageFields t={t} />
      </FormCard>
      <SaveBar label={t("store.createProduct")} always />
    </form>
  )
}
