/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { adminTranslationsBase } from './adminTranslationsBase';
import { adminTranslationsExtended } from './adminTranslationsExtended';

export type AdminLang = 'ar' | 'en';

const dictionary: Record<string, string> = {
  ...adminTranslationsBase,
  ...adminTranslationsExtended,
};


export const useAdminTranslation = (lang: AdminLang) => {
  return (text: string): string => {
    if (lang === 'en') {
      const trimmed = text.trim();
      return dictionary[trimmed] || text;
    }
    return text;
  };
};