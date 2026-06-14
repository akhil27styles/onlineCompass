import en from './en.json';
import ar from './ar.json';
import es from './es.json';
import fr from './fr.json';
import tr from './tr.json';
import ur from './ur.json';

const bundles: Record<string, Record<string, string>> = { en, ar, es, fr, tr, ur };

export type TranslationKey = keyof typeof en;
export type Translations = Record<TranslationKey, string>;

export function getTranslations(lang: string): Translations {
  const bundle = bundles[lang];
  if (!bundle) return en as unknown as Translations;
  return { ...en, ...bundle } as unknown as Translations;
}

export function t(key: string): string {
  return key;
}
