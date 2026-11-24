import { redirect } from "next/navigation"
import { param } from "@/lib/url"

// Membership types live in Mitglieder › Einstellungen now; ?new=type / ?edit=<id> open the type sheet there.
export default async function MembershipTypesPage({ searchParams }: PageProps<"/members/types">) {
  const sp = await searchParams
  const edit = param(sp, "edit")
  redirect(edit ? `/members/settings?edit=${encodeURIComponent(edit)}` : param(sp, "new") ? "/members/settings?new=type" : "/members/settings#types")
}
