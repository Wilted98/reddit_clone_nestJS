import { z } from 'zod';

const preferencesSchema = z.object({
  recent: z.boolean().default(true),
  subscriptions: z.boolean().default(true),
});

export type SidebarSection = keyof z.infer<typeof preferencesSchema>;
export const SIDEBAR_PREFERENCES_KEY = 'roorin:sidebar-preferences';
const eventName = 'roorin:sidebar-preferences';
let fallback: string | undefined;

export function parseSidebarPreferences(value: string | null) {
  try {
    const result = preferencesSchema.safeParse(JSON.parse(value ?? '{}'));
    if (result.success) return result.data;
  } catch {
    // Invalid stored preferences fall back to the first-visit defaults.
  }
  return { recent: true, subscriptions: true };
}

export function readSidebarPreferences() {
  if (fallback !== undefined) return fallback;
  try {
    return window.localStorage.getItem(SIDEBAR_PREFERENCES_KEY);
  } catch {
    return null;
  }
}

export function toggleSidebarSection(section: SidebarSection) {
  const preferences = parseSidebarPreferences(readSidebarPreferences());
  const value = JSON.stringify({
    ...preferences,
    [section]: !preferences[section],
  });
  try {
    window.localStorage.setItem(SIDEBAR_PREFERENCES_KEY, value);
    fallback = undefined;
  } catch {
    fallback = value;
  }
  window.dispatchEvent(new Event(eventName));
}

export function subscribeSidebarPreferences(callback: () => void) {
  function storageChanged(event: StorageEvent) {
    if (event.key !== null && event.key !== SIDEBAR_PREFERENCES_KEY) return;
    if (event.storageArea && event.storageArea !== window.localStorage) return;
    fallback = undefined;
    callback();
  }
  window.addEventListener('storage', storageChanged);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener(eventName, callback);
  };
}
