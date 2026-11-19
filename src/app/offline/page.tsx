import { RotateCwIcon, WifiOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getT } from "@/i18n/server"

// Shown by the service worker when the installed App has no connection.
export default async function OfflinePage() {
  const t = await getT()
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-6 text-center">
      <div className="grid max-w-xs justify-items-center gap-3">
        <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          <WifiOffIcon className="size-6" />
        </span>
        <h1 className="text-lg font-semibold">{t("pwa.offlineTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pwa.offlineText")}</p>
        {/* A plain link to this same address: works without JavaScript (the scripts may not be cached offline). */}
        <Button render={<a href="" />} nativeButton={false} className="mt-2">
          <RotateCwIcon /> {t("pwa.reload")}
        </Button>
      </div>
    </main>
  )
}
