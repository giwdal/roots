import { ImageResponse } from "next/og"

// The installed App's icon (home screen, splash): the "r" of the roots wordmark on the dark tile. Sizes 180 (iOS),
// 192, 512; `maskable` keeps the letter inside Android's safe zone.
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params
  const maskable = raw.endsWith("-maskable")
  const size = [180, 192, 512].includes(Number.parseInt(raw)) ? Number.parseInt(raw) : 512
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#18181b", color: "#fafafa", fontSize: size * (maskable ? 0.46 : 0.62), fontWeight: 700, letterSpacing: "-0.04em", paddingBottom: size * 0.06 }}>
        r
      </div>
    ),
    { width: size, height: size, headers: { "cache-control": "public, max-age=86400" } },
  )
}
