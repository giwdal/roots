// Language codes and names without the message files, so client components can import them without shipping the
// whole de.json + en.json to the browser (config.ts holds the messages, server side).
export const locales = ["de", "en"] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = "de"
export const localeNames: Record<Locale, string> = { de: "Deutsch", en: "English" }
export const isLocale = (v: unknown): v is Locale => locales.includes(v as Locale)
