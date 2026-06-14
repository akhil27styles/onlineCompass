export type Locale = {
  code: string;
  label: string;
  dir: 'ltr' | 'rtl';
};

export const SUPPORTED_LOCALES: Locale[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'tr', label: 'Türkçe', dir: 'ltr' },
  { code: 'ur', label: 'اردو', dir: 'rtl' },
];

export const DEFAULT_LOCALE = 'en';

export function isDefaultLocale(code: string): boolean {
  return code === DEFAULT_LOCALE;
}

export function getLocale(code: string): Locale {
  return SUPPORTED_LOCALES.find((l) => l.code === code) || SUPPORTED_LOCALES[0];
}
