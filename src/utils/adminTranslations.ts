/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** The Admin interface is Arabic-only; keep this helper for existing call sites. */
export type AdminLang = 'ar';

export const useAdminTranslation = (_lang: AdminLang) => (text: string): string => text;
