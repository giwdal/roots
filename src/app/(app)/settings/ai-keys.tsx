import { Trash2Icon } from "lucide-react"
import { PROVIDERS, type Provider } from "@/assistant/providers"
import { ProviderLogo } from "@/components/provider-logo"
import { AddLink, RowGroup } from "@/components/section"
import { SubmitButton } from "@/components/submit-button"
import { getT } from "@/i18n/server"
import type { getContext } from "@/lib/context"
import { SproutRefresh } from "@/components/sprout/refresh"
import { deleteAiKeyAction } from "./ai-actions"

/** KI-Assistent: the person's own API keys (one per provider) as rows; Sprout offers their models. Adding = ?new=key. */
export async function AiKeys({ ctx }: { ctx: Awaited<ReturnType<typeof getContext>> }) {
  const t = await getT()
  const { data: keys } = await ctx.supabase.from("ai_keys").select("provider, hint, models, updated_at").eq("user_id", ctx.userId).order("provider")
  return (
    <RowGroup id="ai" title={t("sprout.keysTitle")} description={t("sprout.keysHint")}>
      <SproutRefresh stamp={(keys ?? []).map((k) => `${k.provider}${k.updated_at}`).join()} />
      {(keys ?? []).map((k) => (
        <div key={k.provider} className="flex min-h-12 items-center gap-3 px-4 py-2 text-sm">
          <ProviderLogo provider={k.provider as Provider} />
          <span className="grid min-w-0 flex-1">
            <span className="truncate font-medium">{PROVIDERS[k.provider as Provider]?.label}</span>
            <span className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{k.hint}</span> · {t("sprout.modelCount", { count: Array.isArray(k.models) ? k.models.length : 0 })}
            </span>
          </span>
          <form action={deleteAiKeyAction}>
            <input type="hidden" name="provider" value={k.provider} />
            <SubmitButton variant="ghost" size="icon-sm" aria-label={t("sprout.deleteKey")} data-confirm="sprout.confirmDeleteKey" className="text-destructive hover:text-destructive">
              <Trash2Icon />
            </SubmitButton>
          </form>
        </div>
      ))}
      <div className="px-4 py-2">
        <AddLink href="/settings/ai?new=key">{t("sprout.addKey")}</AddLink>
      </div>
    </RowGroup>
  )
}
