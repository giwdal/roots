"use client"

import { useRef } from "react"
import { useFormStatus } from "react-dom"
import { CameraIcon, Loader2Icon } from "lucide-react"

const Hidden = ({ hidden }: { hidden?: Record<string, string> }) => Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)

/** Wraps a picture: tapping it opens the file picker, choosing a file uploads it right away. */
export function PicturePicker({ id, action, hidden, label, square, children }: { id: string; square?: boolean; action: (f: FormData) => Promise<void>; hidden?: Record<string, string>; label: string; children: React.ReactNode }) {
  const form = useRef<HTMLFormElement>(null)
  return (
    <form ref={form} action={action} className="contents">
      <Hidden hidden={hidden} />
      <Pick id={id} label={label} square={square} onPick={() => form.current?.requestSubmit()}>
        {children}
      </Pick>
    </form>
  )
}

function Pick({ id, label, square, onPick, children }: { id: string; label: string; square?: boolean; onPick: () => void; children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <label htmlFor={id} className={`group/pic relative grid cursor-pointer place-items-center ${square ? "rounded-lg" : "rounded-full"} has-focus-visible:ring-3 has-focus-visible:ring-ring/50`} aria-busy={pending} title={label}>
      {children}
      <span className="absolute inset-0 grid place-items-center rounded-[inherit] bg-black/40 text-white opacity-0 transition-opacity group-hover/pic:opacity-100 [@media(hover:none)]:opacity-0 data-[pending]:opacity-100" data-pending={pending || undefined}>
        {pending ? <Loader2Icon className="size-5 animate-spin" /> : <CameraIcon className="size-5" />}
      </span>
      <span className="sr-only">{label}</span>
      <input id={id} type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={pending} className="sr-only" onChange={(e) => e.currentTarget.files?.length && onPick()} />
    </label>
  )
}

/** "Bild entfernen" as a quiet link that asks first. */
export function PictureRemove({ action, hidden, label }: { action: (f: FormData) => Promise<void>; hidden?: Record<string, string>; label: string }) {
  return (
    <form action={action}>
      <Hidden hidden={hidden} />
      <input type="hidden" name="remove" value="1" />
      <button type="submit" data-confirm="common.confirmRemoveImage" className="text-left text-xs text-[var(--link)] hover:underline">
        {label}
      </button>
    </form>
  )
}
