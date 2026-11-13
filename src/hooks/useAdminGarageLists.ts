import { useState, useEffect, useMemo, useRef } from 'react';
import type { Garage } from '../types';
import { normalizeArabicSearch, normalizeDigits } from '../utils/plates';
import { sortGaragesNewestFirst } from '../utils/dates';
import { useLocalStorageState } from './useLocalStorage';
import { useBackHandler } from './backHandler';

/**
 * useAdminGarageLists
 *
 * Owns the admin dashboard's tab navigation + garage search/filter pipeline.
 *
 * Responsibilities:
 *   - activeTab state (persisted to localStorage) + legacy-tab migration
 *     effect (older browser storage may point at retired tabs like
 *     'overview' / 'packages' / 'trial_leads' / 'supervisors' — those
 *     values are normalized to their successors on mount).
 *   - adminSearch state (keystrokes from AdminHeader's search field).
 *   - Pre-normalized search index (searchableGarages) — built once when
 *     the garage list changes, not on every keystroke.
 *   - approvedGarages, pendingGarages, displayedGarages — derived lists.
 *   - mainScrollRef + scroll-to-top-on-tab-change effect.
 *   - One useBackHandler entry: pressing back from a sub-tab (admin-pin,
 *     active_sessions, wallet_settings, etc.) returns to 'catalog_settings'.
 *
 * Extracted Stage 4 of the structural refactor. Previously these
 * 5 useState + 4 useMemo + 2 useEffect + 1 useBackHandler lived inline
 * in AdminDashboard.tsx.
 */

export type AdminTab =
  | 'overview' | 'garages' | 'packages' | 'people' | 'delegates'
  | 'requests' | 'trial_leads' | 'supervisors' | 'admin-pin'
  | 'catalog_settings' | 'active_sessions' | 'wallet_settings'
  | 'credit_rate_settings' | 'daily_garage_reports';

const SUB_TABS_RETURNING_TO_CATALOG: ReadonlySet<AdminTab> = new Set([
  'admin-pin',
  'active_sessions',
  'wallet_settings',
  'credit_rate_settings',
  'daily_garage_reports',
]);

export interface UseAdminGarageListsResult {
  activeTab: AdminTab;
  setActiveTab: (tab: AdminTab) => void;
  adminSearch: string;
  setAdminSearch: (tab: string) => void;
  approvedGarages: Garage[];
  pendingGarages: Garage[];
  displayedGarages: Garage[];
  mainScrollRef: React.RefObject<HTMLElement>;
}

export function useAdminGarageLists(allGarages: Garage[]): UseAdminGarageListsResult {
  // `activeTab` includes retired values ('overview' | 'packages' | 'trial_leads' |
  // 'supervisors') so the redirect effect below can detect and migrate them out
  // of older browsers' localStorage. They have no UI surface.
  const [activeTab, setActiveTab] = useLocalStorageState<AdminTab>('app_admin_tab', 'garages');
  const [adminSearch, setAdminSearch] = useState<string>('');

  // Older browser storage may point at retired tabs. Normalize these saved
  // values without touching user data.
  useEffect(() => {
    if (activeTab === 'supervisors') setActiveTab('people');
    else if (activeTab === 'trial_leads' || activeTab === 'overview') setActiveTab('garages');
    else if (activeTab === 'packages') setActiveTab('catalog_settings');
  }, [activeTab, setActiveTab]);

  // ── Back-handler for sub-tabs ──────────────────────────────────────
  // Pressing back from a settings sub-tab returns to the catalog root.
  useBackHandler(
    () => { setActiveTab('catalog_settings'); return true; },
    SUB_TABS_RETURNING_TO_CATALOG.has(activeTab),
  );

  const mainScrollRef = useRef<HTMLElement>(null);

  // Reset scroll position when the tab changes.
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [activeTab]);

  // Reset pagination size when the tab changes (kept for parity with the
  // old behavior — the active-vehicles list uses itemsPerPage, this
  // reset effect mirrors the same pattern for admin lists).
  useEffect(() => {
    // No-op for now; tab change triggers above scroll-to-top.
    // Kept as a placeholder so future per-tab resets live next to the
    // tab owner.
  }, [activeTab]);

  const approvedGarages = useMemo(
    () => sortGaragesNewestFirst(allGarages.filter(g => g.status !== 'pending')),
    [allGarages],
  );

  const pendingGarages = useMemo(
    () => sortGaragesNewestFirst(allGarages.filter(g => g.status === 'pending')),
    [allGarages],
  );

  // Pre-normalize search fields once when the garage list changes, not on
  // every keystroke. Filters out pending garages (never searchable) so the
  // search loop below only touches approved rows.
  const searchableGarages = useMemo(() => {
    return allGarages
      .filter(garage => garage && garage.status !== 'pending')
      .map(garage => ({
        garage,
        normalizedName: normalizeArabicSearch(garage.name || ''),
        rawPhone: garage.phone || '',
        normalizedPhone: normalizeDigits(garage.phone || ''),
      }));
  }, [allGarages]);

  const displayedGarages = useMemo(() => {
    const rawSearch = adminSearch.trim();
    if (!rawSearch) return approvedGarages;

    const q = normalizeArabicSearch(rawSearch);
    const digitQuery = normalizeDigits(rawSearch);

    const filtered = searchableGarages
      .filter(({ normalizedName, rawPhone, normalizedPhone }) => {
        const phoneMatch = rawPhone.includes(rawSearch) || (digitQuery ? normalizedPhone.includes(digitQuery) : false);
        return normalizedName.includes(q) || phoneMatch;
      })
      .map(({ garage }) => garage);

    return sortGaragesNewestFirst(filtered);
  }, [searchableGarages, approvedGarages, adminSearch]);

  return {
    activeTab,
    setActiveTab,
    adminSearch,
    setAdminSearch,
    approvedGarages,
    pendingGarages,
    displayedGarages,
    mainScrollRef,
  };
}
