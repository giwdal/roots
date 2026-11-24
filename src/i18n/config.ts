import de from "./messages/de.json"
import en from "./messages/en.json"

import type { Locale } from "./locales"

export { locales, defaultLocale, localeNames, isLocale, type Locale } from "./locales"

// de.json is the source of truth; this assignment fails to type-check if en.json is missing a key.
export type Messages = typeof de
export const messages: Record<Locale, Messages> = { de, en }

