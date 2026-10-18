/**
 * Asks the browser not to evict this origin's storage (sign-in session in
 * localStorage, workout drafts and the sync outbox in IndexedDB). Browsers
 * grant it silently for installed / frequently used apps; it never prompts on
 * mobile. Safe to call repeatedly.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
