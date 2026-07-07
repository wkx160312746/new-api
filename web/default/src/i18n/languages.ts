/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

export const INTERFACE_LANGUAGE_OPTIONS = [
  { code: 'zhCN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'ru', label: 'Русский' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'zhTW', label: '繁體中文' }
] as const

export type InterfaceLanguageCode =
  (typeof INTERFACE_LANGUAGE_OPTIONS)[number]['code']

export function normalizeInterfaceLanguage(value?: string | null): string {
  if (!value) return 'en'

  var normalized = value.trim().replace(/_/g, '-').toLowerCase()
  if (value === 'zh-TW' || value === 'zh-HK' || value === 'zh-MO' || value === 'zhTW') {
    normalized = 'zhTW'
  }
  if (value === 'zh-CN' || value === 'zh-Hans' || value === "zhCN") {
    normalized = 'zhCN'
  }

  return INTERFACE_LANGUAGE_OPTIONS.some((lang) => lang.code === normalized)
    ? normalized
    : 'en'
}

const INTL_LOCALE_ALIASES: Record<string, string> = {
  zhcn: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  zhtw: 'zh-TW',
  'zh-tw': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW',
}

function canonicalizeIntlLocale(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const aliasKey = trimmed.replace(/_/g, '-').toLowerCase()
  const candidate = INTL_LOCALE_ALIASES[aliasKey] ?? trimmed

  try {
    return Intl.getCanonicalLocales(candidate)[0]
  } catch {
    return undefined
  }
}

export function toIntlLocale(
  value?: Intl.LocalesArgument | null
): Intl.LocalesArgument | undefined {
  if (!value) return undefined

  if (Array.isArray(value)) {
    const locales = value
      .map((item) => canonicalizeIntlLocale(String(item)))
      .filter((item): item is string => !!item)
    return locales.length > 0 ? locales : undefined
  }

  return canonicalizeIntlLocale(String(value))
}
