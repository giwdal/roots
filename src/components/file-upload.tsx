"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"
import { registerFiles, type UploadedFile } from "@/app/(app)/files/actions"
import { Button } from "@/components/ui/button"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { MAX_FILE_BYTES } from "@/lib/files"
import { createClient } from "@/lib/supabase/client"

// Resize photos to at most 2000 px and re-encode as WebP, but only keep the result when it is smaller.
// GIFs (animation) and SVGs stay as they are.
export async function compress(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" })
  } catch {
    return file
  }
}

type T = ReturnType<typeof useT>

/** Upload to Storage (photos compressed) and register the rows; returns the stored files (id for /files/<id>). */
export async function uploadFiles(orgId: string, list: File[], target: { entity?: string; entityId?: string; folder?: string }, t: T) {
  const supabase = createClient()
  const done: UploadedFile[] = []
  for (const original of list) {
    const file = await compress(original)
    if (file.size > MAX_FILE_BYTES) {
      toast.error(t("files.tooLarge", { name: file.name }))
      continue
    }
    const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "bin"
    const path = `orgs/${orgId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from("files").upload(path, file, { contentType: file.type || "application/octet-stream" })
    if (error) toast.error(t("files.uploadFailed", { name: file.name }))
    else done.push({ id: crypto.randomUUID(), name: file.name, path, mime: file.type, size: file.size })
  }
  if (!done.length) return []
  const r = await registerFiles(done, target)
  if (r.error) {
    toast.error(r.error)
    return []
  }
  return done.map((f, i) => ({ ...f, id: r.ids?.[i] || f.id! })) // the id we chose, if the server didn't echo it
}

/** Upload button for any record (entity + entityId) or the Files page (folder). Uploads go straight to Storage.
 * `big`: the upload sheet's version — a large tap target that also takes dropped files. */
export function FileUpload({ orgId, entity, entityId, folder, big }: { orgId: string; entity?: string; entityId?: string; folder?: string; big?: boolean }) {
  const t = useT()
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [over, setOver] = useState(false)

  const upload = (list: FileList | File[] | null) => {
    const files = [...(list ?? [])]
    if (!files.length) return
    start(async () => {
      const done = await uploadFiles(orgId, files, { entity, entityId, folder }, t)
      if (input.current) input.current.value = ""
      if (done.length) toast.success(t("files.uploaded", { count: done.length }))
      router.refresh()
    })
  }

  if (big)
    return (
      <>
        <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          onDragOver={(e) => (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => (e.preventDefault(), setOver(false), upload(e.dataTransfer.files))}
          className={cn("grid min-h-40 w-full place-items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-muted active:bg-muted", over && "border-primary bg-muted")}
        >
          {pending ? <Loader2Icon className="size-6 animate-spin" /> : <UploadIcon className="size-6" />}
          <span className="font-medium text-foreground">{pending ? t("files.uploading") : t("files.pick")}</span>
          <span className="max-md:hidden">{t("files.orDrop")}</span>
        </button>
      </>
    )

  return (
    <>
      <input ref={input} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
        {pending ? <Loader2Icon className="animate-spin" /> : <UploadIcon />}
        {pending ? t("files.uploading") : t("files.upload")}
      </Button>
    </>
  )
}

/** Drop files anywhere on a list (desktop) to upload them into the open folder; a hint covers the list while dragging. */
export function FileDrop({ orgId, folder, children }: { orgId: string; folder?: string; children: React.ReactNode }) {
  const t = useT()
  const router = useRouter()
  const [over, setOver] = useState(false)
  const [pending, start] = useTransition()
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes("Files")
  return (
    <div
      className="relative grid min-w-0"
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(false)
        const files = [...e.dataTransfer.files]
        start(async () => {
          const done = await uploadFiles(orgId, files, { folder }, t)
          if (done.length) toast.success(t("files.uploaded", { count: done.length }))
          router.refresh()
        })
      }}
    >
      {children}
      {(over || pending) && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/80 text-sm font-medium">
          <span className="flex items-center gap-2">
            {pending ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
            {pending ? t("files.uploading") : folder ? t("files.dropInto", { folder }) : t("files.dropHere")}
          </span>
        </div>
      )}
    </div>
  )
}
