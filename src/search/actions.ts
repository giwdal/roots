"use server"

import { getT } from "@/i18n/server"
import { getContext } from "@/lib/context"
import { APP_HOME } from "@/lib/url"
import { visibleNav } from "@/modules/nav"
import { areaSettings, settingsFor } from "@/settings/sections"
import { matchWords } from "@/lib/search-words"

export type SearchItem = { id: string; title: string; detail?: string; href: string; area?: string /* pages: the nav area whose tile they show */ }
export type SearchGroup = { key: string; label: string; items: SearchItem[] }

const PER_GROUP = 5
/**
 * ⌘K search in the active org: pages (navigation + settings) by label, records by name/number. Every source checks
 * module + permission; RLS still applies. All queries run in parallel (one round trip).
 * ponytail: ilike per table, 5 hits each; a full-text index or one search RPC once orgs have many thousand rows.
 */
export async function searchApp(input: string): Promise<SearchGroup[]> {
  const ctx = await getContext()
  const t = await getT()
  const q = String(input ?? "")
    .replace(/[%,()*\\]/g, " ")
    .trim()
    .slice(0, 100)
  if (!q) return []
  const like = `%${q}%`
  const lower = q.toLocaleLowerCase(t.locale)
  const on = (module: string, perm: string) => ctx.modules.has(module) && ctx.can(perm)
  const db = ctx.supabase
  const org = ctx.org.id

  // Pages: everything in the sidebar + settings tabs + a few sub-pages, matched by their label.
  const pages: SearchItem[] = [
    { id: "home", title: t("shell.home"), href: APP_HOME },
    { id: "inbox", title: t("inbox.title"), href: "/notifications" },
    // Every page of the sidebar (sub-pages with their area as detail).
    ...visibleNav((m) => ctx.modules.has(m), ctx.can).flatMap((a) =>
      a.children.map((c) => ({ id: c.href, title: c.label === "nav.overview" ? t.dynamic(a.label) : t.dynamic(c.label), detail: a.children.length > 1 ? t.dynamic(a.label) : undefined, href: c.href, area: a.key })),
    ),
    ...(on("crm", "crm.manage") ? [{ id: "contacts-import", title: t("contacts.import"), detail: t("contacts.title"), href: "/contacts/import" }] : []),
    // Views that aren't sidebar entries: Schichten › Meine, Personen › Organigramm.
    ...(on("shifts", "shifts.self") ? [{ id: "shifts-me", title: t("shifts.tabs.me"), detail: t("shifts.nav"), href: "/shifts/me" }] : []),
    ...(on("hr", "hr.view") ? [{ id: "hr-chart", title: t("hr.views.chart"), detail: t("hr.nav"), href: "/hr/chart" }] : []),
    ...settingsFor(ctx.can, areaSettings((m) => ctx.modules.has(m), ctx.can).length > 0).flatMap((g) =>
      g.sections.map((s) => ({ id: `settings-${s.key}`, title: t.dynamic(`settings.tabs.${s.key}`), detail: t("shell.settings"), href: `/settings/${s.key}` })),
    ),
  ]
  const pageHits = pages.filter((p, i, all) => all.findIndex((x) => x.href === p.href) === i && `${p.title} ${p.detail ?? ""}`.toLocaleLowerCase(t.locale).includes(lower))

  const none = Promise.resolve({ data: [] as never[] })
  const day = (v: string | null) => (v ? t.date(v, { dateStyle: "medium" }) : undefined)
  const [contacts, members, events, docs, forms, campaigns, mailTemplates, files, templates, wiki, projects, tasks, objects, products, shopOrders, guestLists, employees, courses, workflows, staff, payments] = await Promise.all([
    on("crm", "crm.view")
      ? matchWords(db.from("contacts").select("id, first_name, last_name, company, email").eq("org_id", org).is("deleted_at", null), q, ["first_name", "last_name", "company", "email", "phone", "city"]).limit(PER_GROUP)
      : none,
    on("members", "members.view")
      ? matchWords(db.from("memberships").select("id, member_no, contacts!inner(first_name, last_name, company)").eq("org_id", org).is("deleted_at", null), q, ["first_name", "last_name", "company"], { referencedTable: "contacts" }).limit(PER_GROUP)
      : none,
    on("events", "events.view") ? db.from("events").select("id, title, starts_at").eq("org_id", org).is("deleted_at", null).ilike("title", like).order("starts_at", { ascending: false }).limit(PER_GROUP) : none,
    on("invoices", "invoices.view")
      ? db
          .from("documents")
          .select("id, kind, number, recipient_name, title")
          .eq("org_id", org)
          .or(["number", "recipient_name", "title"].map((c) => `${c}.ilike.${like}`).join(","))
          .order("created_at", { ascending: false })
          .limit(PER_GROUP)
      : none,
    on("forms", "forms.view") ? db.from("forms").select("id, title").eq("org_id", org).is("deleted_at", null).ilike("title", like).limit(PER_GROUP) : none,
    on("email", "email.view") ? db.from("email_campaigns").select("id, name").eq("org_id", org).is("deleted_at", null).ilike("name", like).limit(PER_GROUP) : none,
    on("email", "email.view") ? db.from("email_templates").select("id, name").eq("org_id", org).ilike("name", like).limit(PER_GROUP) : none,
    ctx.can("org.files.view") ? db.from("files").select("id, name, folder").eq("org_id", org).is("deleted_at", null).ilike("name", like).limit(PER_GROUP) : none,
    ctx.can("org.files.view")
      ? db.from("letter_templates").select("id, name").or(`org_id.is.null,org_id.eq.${org}`).is("deleted_at", null).ilike("name", like).limit(PER_GROUP)
      : none,
    on("wiki", "wiki.view")
      ? db.from("wiki_pages").select("id, title").eq("org_id", org).is("deleted_at", null).or(`title.ilike.${like},body.ilike.${like}`).order("updated_at", { ascending: false }).limit(PER_GROUP)
      : none,
    on("projects", "projects.view") ? db.from("projects").select("id, name").eq("org_id", org).is("deleted_at", null).ilike("name", like).order("updated_at", { ascending: false }).limit(PER_GROUP) : none,
    on("projects", "projects.view")
      ? db.from("tasks").select("id, title, due_on").eq("org_id", org).is("deleted_at", null).or(`title.ilike.${like},description.ilike.${like}`).order("updated_at", { ascending: false }).limit(PER_GROUP)
      : none,
    on("rentals", "rentals.view")
      ? db.from("rental_objects").select("id, name, kind").eq("org_id", org).is("deleted_at", null).or(`name.ilike.${like},description.ilike.${like}`).order("name").limit(PER_GROUP)
      : none,
    on("shop", "shop.view") ? db.from("products").select("id, name, category").eq("org_id", org).is("deleted_at", null).or(`name.ilike.${like},category.ilike.${like}`).order("name").limit(PER_GROUP) : none,
    on("shop", "shop.view")
      ? db.from("shop_orders").select("id, number, name").eq("org_id", org).not("placed_at", "is", null).or(/^\d+$/.test(q.trim()) ? `number.eq.${q.trim()}` : `name.ilike.${like}`).order("placed_at", { ascending: false }).limit(PER_GROUP)
      : none,
    on("guestlists", "guestlists.view")
      ? db.from("guest_lists").select("id, name, events(title, starts_at)").eq("org_id", org).is("deleted_at", null).ilike("name", like).order("created_at", { ascending: false }).limit(PER_GROUP)
      : none,
    on("hr", "hr.view") ? db.from("employees").select("id, name, job_title").eq("org_id", org).is("deleted_at", null).or(`name.ilike.${like},job_title.ilike.${like}`).order("name").limit(PER_GROUP) : none,
    on("courses", "courses.view") ? db.from("courses").select("id, title").eq("org_id", org).is("deleted_at", null).ilike("title", like).order("created_at", { ascending: false }).limit(PER_GROUP) : none,
    on("automations", "automations.view") ? db.from("workflows").select("id, name, active").eq("org_id", org).is("deleted_at", null).ilike("name", like).order("name").limit(PER_GROUP) : none,
    on("shifts", "shifts.view") ? db.from("staff").select("id, name, active").eq("org_id", org).ilike("name", like).order("name").limit(PER_GROUP) : none,
    on("payments", "payments.view")
      ? db.from("pay_orders").select("id, customer_name, customer_email, amount_total, currency, created_at").eq("org_id", org).or(`customer_name.ilike.${like},customer_email.ilike.${like}`).order("created_at", { ascending: false }).limit(PER_GROUP)
      : none,
  ])

  const person = (c: { first_name: string | null; last_name: string | null; company: string | null } | null) =>
    [c?.first_name, c?.last_name].filter(Boolean).join(" ") || c?.company || "–"
  // Records first (what people look for), the matching pages after them.
  const groups: SearchGroup[] = [
    {
      key: "contacts",
      label: t("contacts.title"),
      items: (contacts.data ?? []).map((c) => ({ id: c.id, title: person(c), detail: c.email ?? c.company ?? undefined, href: `/contacts/${c.id}` })),
    },
    {
      key: "members",
      label: t("membership.nav"),
      items: (members.data ?? []).map((m) => ({ id: m.id, title: person(m.contacts), detail: m.member_no ? t("membership.numberShort", { number: m.member_no }) : undefined, href: `/members/${m.id}` })),
    },
    { key: "events", label: t("eventsPage.nav"), items: (events.data ?? []).map((e) => ({ id: e.id, title: e.title, detail: day(e.starts_at), href: `/events/${e.id}` })) },
    {
      key: "invoices",
      label: t("invoices.nav"),
      items: (docs.data ?? []).map((d) => ({
        id: d.id,
        title: `${t.dynamic(`invoices.kinds.${d.kind}`)} ${d.number ?? ""}`.trim(),
        detail: d.recipient_name ?? d.title ?? undefined,
        href: `/invoices/${d.id}`,
      })),
    },
    {
      key: "guestlists",
      label: t("guestlists.nav"),
      items: (guestLists.data ?? []).map((g) => ({
        id: g.id,
        title: g.name,
        detail: g.events ? `${g.events.title} · ${day(g.events.starts_at)}` : t("guestlists.permanent"),
        href: `/guestlists/${g.id}`,
      })),
    },
    { key: "employees", label: t("hr.tabs.people"), items: (employees.data ?? []).map((x) => ({ id: x.id, title: x.name, detail: x.job_title ?? undefined, href: `/hr/${x.id}` })) },
    { key: "forms", label: t("forms.nav"), items: (forms.data ?? []).map((f) => ({ id: f.id, title: f.title, href: `/forms/${f.id}` })) },
    { key: "email", label: t("email.nav"), items: [
        ...(campaigns.data ?? []).map((c) => ({ id: c.id, title: c.name, href: `/email/${c.id}` })),
        ...(mailTemplates.data ?? []).map((c) => ({ id: c.id, title: c.name, detail: t("email.templates.title"), href: `/email/settings?edit=${c.id}` })),
      ] },
    { key: "files", label: t("files.title"), items: (files.data ?? []).map((f) => ({ id: f.id, title: f.name, detail: f.folder ?? undefined, href: `/files?edit=${f.id}` })) },
    { key: "wiki", label: t("wiki.title"), items: (wiki.data ?? []).map((w) => ({ id: w.id, title: w.title, href: `/wiki/${w.id}` })) },
    { key: "projects", label: t("projects.title"), items: (projects.data ?? []).map((x) => ({ id: x.id, title: x.name, href: `/projects/${x.id}` })) },
    { key: "tasks", label: t("projects.tasks"), items: (tasks.data ?? []).map((x) => ({ id: x.id, title: x.title, detail: day(x.due_on), href: `/projects/tasks?task=${x.id}` })) },
    { key: "rentals", label: t("rentals.title"), items: (objects.data ?? []).map((x) => ({ id: x.id, title: x.name, detail: t.has(`rentals.kinds.${x.kind}`) ? t.dynamic(`rentals.kinds.${x.kind}`) : x.kind, href: `/rentals/${x.id}` })) },
    { key: "products", label: t("store.products"), items: (products.data ?? []).map((x) => ({ id: x.id, title: x.name, detail: x.category ?? undefined, href: `/shop/${x.id}` })) },
    { key: "shop_orders", label: t("store.orders"), items: (shopOrders.data ?? []).map((x) => ({ id: x.id, title: `#${x.number} · ${x.name}`, href: `/shop/orders/${x.id}` })) },
    { key: "courses", label: t("courses.nav"), items: (courses.data ?? []).map((x) => ({ id: x.id, title: x.title, href: `/courses/${x.id}` })) },
    { key: "automations", label: t("automations.nav"), items: (workflows.data ?? []).map((x) => ({ id: x.id, title: x.name, href: `/automations/${x.id}` })) },
    { key: "staff", label: t("shifts.nav"), items: (staff.data ?? []).map((x) => ({ id: x.id, title: x.name, href: `/shifts/hours/${x.id}` })) },
    {
      key: "payments",
      label: t("payments.nav"),
      items: (payments.data ?? []).map((x) => ({ id: x.id, title: x.customer_name || x.customer_email || "–", detail: `${t.money(x.amount_total, x.currency)} · ${day(x.created_at)}`, href: `/payments?edit=${x.id}` })),
    },
    { key: "templates", label: t("letters.title"), items: (templates.data ?? []).map((x) => ({ id: x.id, title: x.name, href: `/files/templates/${x.id}` })) },
    { key: "pages", label: t("search.pages"), items: pageHits.slice(0, 8) },
  ]
  return groups.filter((g) => g.items.length)
}
