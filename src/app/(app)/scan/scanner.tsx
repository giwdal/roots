"use client"

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react"
import { CameraIcon, CameraOffIcon, CloudOffIcon, RefreshCwIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useT } from "@/i18n/client"
import { cn } from "@/lib/utils"
import { localAdmit, queuedMember, visitLimitReached, type MemberAtDoor } from "@/members/door"
import { admitMember, checkIn, lookupCode, scanList, scanMembers, syncCheckIns, type ScanEntry, type ScanResult } from "./actions"
import { MemberCard } from "./member-card"
import { doorChanged } from "./door-stats"
import { SubmitButton } from "@/components/submit-button"

type Pt = { x: number; y: number }
type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string; cornerPoints: Pt[] }[]> }

// Camera QR scanning: native BarcodeDetector (Chrome/Android) or jsQR (Safari/iPhone), plus typing the code.
// Offline: the ticket list is kept on the device (localStorage); without connection codes are checked against it and
// check-ins queue up until the device is online again. Members (card code or member number) work the same way: their
// list is kept too, letting one in offline queues "member:<contact id>". ponytail: two offline devices can both let in the same ticket
// (reported as conflict on sync); the page must stay open (no service worker yet).
type Store = { list: Record<string, ScanEntry>; members?: MemberAtDoor[]; at: string; queue: string[] }
const KEY = (eventId: string) => `roots-scan-${eventId}`
const load = (eventId: string): Store => {
  try {
    return JSON.parse(localStorage.getItem(KEY(eventId)) ?? "") as Store
  } catch {
    return { list: {}, at: "", queue: [] }
  }
}
const save = (eventId: string, s: Store) => {
  try {
    localStorage.setItem(KEY(eventId), JSON.stringify(s))
  } catch {}
}
export function Scanner({ eventId }: { eventId: string }) {
  const t = useT()
  const video = useRef<HTMLVideoElement>(null)
  const [camera, setCamera] = useState(false)
  const [found, setFound] = useState<{ w: number; h: number; pts: string } | null>(null)
  // The camera stays on between visits on this device (the door phone): switched on again after load.
  const toggleCamera = (on: boolean) => {
    setCamera(on)
    try {
      localStorage.setItem("roots-scan-camera", on ? "1" : "")
    } catch {}
  }
  // Only when the scanner is on screen (phones render the door's other views next to it, hidden).
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    try {
      if (localStorage.getItem("roots-scan-camera") && root.current?.offsetParent) Promise.resolve().then(() => setCamera(true))
    } catch {}
  }, [])
  const [last, setLast] = useState<(ScanResult & { code: string }) | null>(null)
  const [pending, start] = useTransition()
  const busy = useRef(false)
  const recent = useRef<{ code: string; at: number }>({ code: "", at: 0 })
  const [store, setStore] = useState<Store>({ list: {}, at: "", queue: [] })
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb)
      window.addEventListener("offline", cb)
      return () => {
        window.removeEventListener("online", cb)
        window.removeEventListener("offline", cb)
      }
    },
    () => navigator.onLine,
    () => true,
  )
  const [syncNote, setSyncNote] = useState("")
  const update = (next: Store) => {
    save(eventId, next)
    setStore(next)
  }

  async function refresh() {
    try {
      const [list, members] = await Promise.all([scanList(eventId), scanMembers(eventId)])
      const cur = load(eventId)
      // Keep local check-ins that haven't been synced yet.
      const map = Object.fromEntries(list.map((e) => [e.code, cur.queue.includes(e.code) ? { ...e, status: "used" as const } : e]))
      const local = new Map(cur.members?.map((m) => [m.contact_id, m]))
      const mine = members.map((m) => (cur.queue.some((e) => queuedMember(e)?.contactId === m.contact_id) ? (local.get(m.contact_id) ?? m) : m))
      update({ list: map, members: mine, at: new Date().toISOString(), queue: cur.queue })
    } catch {}
  }

  async function sync() {
    const cur = load(eventId)
    if (!cur.queue.length) return
    try {
      const r = await syncCheckIns(eventId, cur.queue)
      update({ ...load(eventId), queue: [] })
      setSyncNote(t("tickets.synced", { count: r.synced }) + (r.conflicts.length ? ` · ${t("tickets.conflicts", { codes: r.conflicts.join(", ") })}` : ""))
    } catch {}
  }

  useEffect(() => {
    const on = () => sync().then(refresh)
    window.addEventListener("online", on)
    Promise.resolve().then(() => setStore(load(eventId))).then(on) // device list first, then server
    const timer = setInterval(() => navigator.onLine && on(), 60_000)
    return () => {
      window.removeEventListener("online", on)
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per event
  }, [eventId])

  // No connection: look the code up in the device list (no check-in yet).
  function peekLocally(code: string): ScanResult {
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    const cur = load(eventId)
    const e = cur.list[clean]
    if (!e) {
      const m = cur.members?.find((x) => x.code === clean || x.number === clean)
      return m ? { result: "ok", member: { ...m, result: m.checked_in_at ? "already" : "member" } } : { result: "invalid" }
    }
    return { result: e.status === "used" ? "used" : "valid", holder: e.holder, type: e.type }
  }

  // No connection: decide on the device and queue the check-in.
  function checkLocally(code: string): ScanResult {
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    const cur = load(eventId)
    const e = cur.list[clean]
    if (!e) {
      const m = cur.members?.find((x) => x.code === clean || x.number === clean)
      return m ? { result: "ok", member: { ...m, result: m.checked_in_at ? "already" : visitLimitReached(m) ? "limit" : "member" } } : { result: "invalid" }
    }
    if (e.status === "used") return { result: "used", holder: e.holder, type: e.type }
    update({ ...cur, list: { ...cur.list, [clean]: { ...e, status: "used" } }, queue: [...cur.queue, clean] })
    return { result: "ok", holder: e.holder, type: e.type, at: new Date().toISOString() }
  }

  // Step 1 (camera or typed code): look up and show the card; nothing is checked in yet.
  function submit(code: string) {
    const now = Date.now()
    if (busy.current || (code === recent.current.code && now - recent.current.at < 4000)) return // same QR still in view
    busy.current = true
    recent.current = { code, at: now }
    start(async () => {
      let r: ScanResult
      try {
        r = navigator.onLine ? await lookupCode(eventId, code) : peekLocally(code)
        if (r.result === "error" && !navigator.onLine) r = peekLocally(code)
      } catch {
        r = peekLocally(code) // request failed (bad venue Wi-Fi): fall back to the device list
      }
      setLast({ ...r, code })
      navigator.vibrate?.(r.result === "valid" || (r.member && r.member.result !== "limit") ? 80 : [80, 60, 80])
      busy.current = false
    })
  }

  // Step 2: "Einchecken" on the card. Done → the card goes away, ready for the next person.
  function confirm(code: string) {
    start(async () => {
      let r: ScanResult
      try {
        r = navigator.onLine ? await checkIn(eventId, code) : checkLocally(code)
        if (r.result === "error" && !navigator.onLine) r = checkLocally(code)
      } catch {
        r = checkLocally(code)
      }
      const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
      const cur = load(eventId)
      if ((r.result === "ok" || r.result === "used") && cur.list[clean]?.status === "valid") update({ ...cur, list: { ...cur.list, [clean]: { ...cur.list[clean], status: "used" } } })
      if (r.result === "ok") {
        setLast(null) // the card going away (and the buzz) is the confirmation
        doorChanged(!navigator.onLine)
        navigator.vibrate?.(80)
      } else {
        setLast({ ...r, code })
        navigator.vibrate?.([80, 60, 80])
      }
    })
  }

  useEffect(() => {
    if (!camera) return
    let stream: MediaStream | undefined
    let stop = false
    const canvas = document.createElement("canvas")
    ;(async () => {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      const v = video.current!
      v.srcObject = stream
      await v.play()
      const Native = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector
      const native = Native ? new Native({ formats: ["qr_code"] }) : null
      const jsQR = native ? null : (await import("jsqr")).default
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      while (!stop) {
        if (v.readyState >= 2) {
          let value: string | undefined
          let corners: Pt[] | undefined
          if (native) {
            const hit = (await native.detect(v))[0]
            value = hit?.rawValue
            corners = hit?.cornerPoints
          } else {
            canvas.width = v.videoWidth
            canvas.height = v.videoHeight
            ctx.drawImage(v, 0, 0)
            const hit = jsQR!(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
            value = hit?.data
            if (hit) corners = [hit.location.topLeftCorner, hit.location.topRightCorner, hit.location.bottomRightCorner, hit.location.bottomLeftCorner]
          }
          // Frame around the code it sees (video pixels; the overlay uses the same size + cropping)
          setFound(corners?.length ? { w: v.videoWidth, h: v.videoHeight, pts: corners.map((c) => `${c.x},${c.y}`).join(" ") } : null)
          if (value) submit(value)
        }
        await new Promise((r) => setTimeout(r, 200))
      }
    })().catch(() => toggleCamera(false))
    return () => {
      stop = true
      setFound(null)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- submit is stable enough (refs + transition)
  }, [camera])

  const count = Object.keys(store.list).length
  // No connection: let in on the device, sync later (conflict if another device let them in meanwhile).
  function admitLocally(contactId: string, override: boolean): MemberAtDoor {
    const cur = load(eventId)
    const m = cur.members?.find((x) => x.contact_id === contactId)
    if (!m) return { result: "invalid" }
    const { member, queue } = localAdmit(m, override, new Date().toISOString())
    if (queue) update({ ...cur, members: cur.members!.map((x) => (x.contact_id === contactId ? member : x)), queue: [...cur.queue, queue] })
    return member
  }

  function admit(contactId: string, override = false) {
    start(async () => {
      let r: MemberAtDoor | { result: "error"; message: string }
      try {
        r = navigator.onLine ? await admitMember(eventId, contactId, override) : admitLocally(contactId, override)
        if (r.result === "error" && !navigator.onLine) r = admitLocally(contactId, override)
      } catch {
        r = admitLocally(contactId, override)
      }
      setLast((l) => l && (r.result === "error" ? { ...l, result: "error", message: r.message, member: undefined } : { ...l, member: r }))
      navigator.vibrate?.(r.result === "ok" ? 80 : [80, 60, 80])
      if (r.result === "ok" && navigator.onLine) refresh()
      if (r.result === "ok") doorChanged(!navigator.onLine)
    })
  }
  // Readable from a step away, also over the camera: solid green = valid, amber = already in, red = anything else.
  const tone =
    last?.result === "valid"
      ? "bg-[var(--success)] text-white"
      : last?.result === "used"
        ? "bg-[var(--warning)] text-black"
        : "bg-destructive text-white"
  // The result card. Over the camera (`full`) it fills the whole window: status big at the top, the action full width
  // at the bottom (thumb reach); with the camera off it is a normal card below the start button.
  const close = (cls?: string) => (
    <Button type="button" size="icon-lg" variant="ghost" onClick={() => setLast(null)} aria-label={t("common.close")} className={cn("shrink-0 text-current hover:bg-black/10", cls)}>
      <XIcon />
    </Button>
  )
  const memberCard = (full: boolean) =>
    last?.member && (
      <div className={cn("grid gap-3", full && "size-full grid-rows-[minmax(0,1fr)_auto] rounded-xl bg-background p-3 shadow-lg")}>
        <div className={cn(full && "overflow-y-auto")}>
          <MemberCard t={t} m={last.member} />
        </div>
        <div className={cn("flex gap-2", full && "flex-col-reverse")}>
          <Button type="button" size="lg" variant="ghost" onClick={() => setLast(null)} className={cn(full && "h-12")}>
            {t("common.close")}
          </Button>
          {(last.member.result === "member" || last.member.result === "limit") && (
            <Button
              type="button"
              size="lg"
              variant={last.member.result === "limit" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => admit(last.member!.contact_id!, last.member!.result === "limit")}
              className={cn(full && "h-14 text-base")}
            >
              {pending ? t("door.member.admitting") : last.member.result === "limit" ? t("door.member.override") : t("door.member.admit")}
            </Button>
          )}
        </div>
      </div>
    )
  const ticketCard = (full: boolean) =>
    last &&
    !last.member && (
      <div role="status" aria-live="assertive" className={cn("rounded-xl p-4 shadow-lg sm:max-w-md", tone, full ? "flex size-full flex-col gap-4 p-5" : "flex items-center gap-3")}>
        <div className={cn("grid min-w-0 flex-1 gap-0.5", full && "content-start gap-2")}>
          <div className="flex items-start gap-2">
            <p className={cn("min-w-0 flex-1 font-semibold", full ? "text-3xl" : "text-xl")}>{t.dynamic(`tickets.scanResult.${last.result}`)}</p>
            {full && close("-mt-1 -mr-2")}
          </div>
          {last.holder && <p className={cn("font-medium break-words", full ? "text-2xl" : "truncate text-base")}>{last.holder}</p>}
          <p className={cn("opacity-80", full ? "text-base" : "truncate text-sm")}>{[last.type, last.code].filter(Boolean).join(" · ")}</p>
          {last.result === "used" && last.at && <p className="text-sm opacity-80">{t("tickets.usedAt", { time: t.date(last.at, { timeStyle: "short" }) })}</p>}
          {last.message && <p className="text-sm">{last.message}</p>}
        </div>
        {last.result === "valid" ? (
          <Button type="button" size="lg" disabled={pending} onClick={() => confirm(last.code)} className={cn("shrink-0 bg-white text-black hover:bg-white/90", full ? "h-16 w-full text-lg" : "h-14 px-6 text-base")}>
            {t("tickets.checkIn")}
          </Button>
        ) : (
          !full && close()
        )}
      </div>
    )

  return (
    <div ref={root} className="grid gap-4">
      {camera ? (
        // Phones: a tall camera with the result lying on top, so it shows without scrolling (Kamera stoppen sits below).
        <div className="relative w-full sm:max-w-md">
          <video ref={video} muted playsInline className="aspect-[3/4] w-full rounded-xl border bg-muted object-cover sm:aspect-square" />
          {found && (
            <svg viewBox={`0 0 ${found.w} ${found.h}`} preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 size-full rounded-xl" aria-hidden>
              <polygon points={found.pts} className="fill-primary/20 stroke-primary" strokeWidth={Math.max(found.w, found.h) / 100} strokeLinejoin="round" />
            </svg>
          )}
          {last && <div className="absolute inset-0">{last.member ? memberCard(true) : ticketCard(true)}</div>}
        </div>
      ) : (
        <>
          <Button type="button" size="lg" onClick={() => toggleCamera(true)} className="h-14 w-full text-base sm:max-w-md">
            <CameraIcon /> {t("tickets.cameraOn")}
          </Button>
          {ticketCard(false)}
        </>
      )}
      {camera && (
        <Button type="button" size="lg" variant="outline" onClick={() => toggleCamera(false)} className="h-14 w-full text-base sm:max-w-md">
          <CameraOffIcon /> {t("tickets.cameraOff")}
        </Button>
      )}
      {!camera && memberCard(false)}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const f = e.currentTarget
          const code = new FormData(f).get("code")
          recent.current = { code: "", at: 0 }
          if (code) submit(String(code))
          f.reset()
        }}
        className="flex gap-2 sm:max-w-md"
      >
        <Input name="code" placeholder={t("tickets.codePlaceholder")} aria-label={t("tickets.code")} autoComplete="off" className="h-12 min-w-0 flex-1 font-mono text-base uppercase" />
        <SubmitButton disabled={pending} variant="outline" size="lg" className="h-12">
          {t("tickets.checkIn")}
        </SubmitButton>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {!online && (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 px-2 py-0.5 text-destructive">
            <CloudOffIcon className="size-3.5" /> {t("tickets.offline")}
          </span>
        )}
        <span>
          {store.at ? t("tickets.listInfo", { count, time: t.date(store.at, { timeStyle: "short" }) }) : t("tickets.listLoading")}
          {store.queue.length > 0 && ` · ${t("tickets.queued", { count: store.queue.length })}`}
        </span>
        <Button type="button" size="xs" variant="ghost" onClick={() => sync().then(refresh)} aria-label={t("tickets.refreshList")}>
          <RefreshCwIcon />
        </Button>
        {syncNote && <span>{syncNote}</span>}
      </div>
    </div>
  )
}
