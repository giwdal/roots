"use client"

import { useRef } from "react"
import { useFormStatus } from "react-dom"
import { ImagePlusIcon, Loader2Icon } from "lucide-react"
import { useT } from "@/i18n/client"
import { productImage } from "../actions"

/** The "+" picture tile: tap → file picker → uploads at once (spinner on the tile while it runs). */
export function PictureAdd({ productId }: { productId: string }) {
  const form = useRef<HTMLFormElement>(null)
  return (
    <form ref={form} action={productImage} className="contents">
      <input type="hidden" name="id" value={productId} />
      <Tile onPick={() => form.current?.requestSubmit()} />
    </form>
  )
}

function Tile({ onPick }: { onPick: () => void }) {
  const t = useT()
  const { pending } = useFormStatus()
  return (
    <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:bg-muted active:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50" aria-busy={pending}>
      {pending ? <Loader2Icon className="size-5 animate-spin" /> : <ImagePlusIcon className="size-5" />}
      <span className="sr-only">{t("store.addImage")}</span>
      <input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={pending} className="sr-only" onChange={(e) => e.currentTarget.files?.length && onPick()} />
    </label>
  )
}
