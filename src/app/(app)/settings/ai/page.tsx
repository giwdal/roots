import { PROVIDERS, type Provider } from "@/assistant/providers"
import { Notice } from "@/components/notice"
import { ProviderLogo } from "@/components/provider-logo"
import { SaveBar } from "@/components/save-bar"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { UrlSheet } from "@/components/url-sheet"
import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { param } from "@/lib/url"
import { saveAiKeyAction } from "../ai-actions"
import { AiKeys } from "../ai-keys"
import { ConnectAi } from "../connect-ai"
import { Connections } from "../connections"

// Du › KI-Assistent: own model keys for Sprout, connecting Claude / Cursor / VS Code, the apps connected so far.
export default async function AiSettings({ searchParams }: PageProps<"/settings/ai">) {
  const [ctx, t, sp] = await Promise.all([getContext(), getT(), searchParams])
  const adding = param(sp, "new") === "key"
  return (
    <div className="grid gap-8">
      <Notice error={adding ? undefined : param(sp, "error")} ok={param(sp, "ok")} />
      <AiKeys ctx={ctx} />
      <ConnectAi />
      <Connections ctx={ctx} scope="mine" back="/settings/ai" />
      {adding && (
        <UrlSheet params={["new"]} title={t("sprout.addKey")} compact>
          <form action={saveAiKeyAction} className="grid gap-4">
            <Notice error={param(sp, "error")} />
            <div className="grid gap-2">
              <Label htmlFor="ai-key">{t("sprout.key")}</Label>
              <Input id="ai-key" name="key" type="password" autoComplete="off" required autoFocus placeholder="sk-ant-… · sk-… · AIza… · xai-…" className="font-mono" />
              <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {(Object.keys(PROVIDERS) as Provider[]).map((p) => (
                  <span key={p} className="inline-flex items-center gap-1">
                    <ProviderLogo provider={p} className="size-3.5" /> {PROVIDERS[p].label}
                  </span>
                ))}
              </p>
            </div>
            <SaveBar label={t("sprout.saveKey")} always />
          </form>
        </UrlSheet>
      )}
    </div>
  )
}

export const instant = false
