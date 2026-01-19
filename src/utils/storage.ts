/**
 * Helper to access chrome.storage.local with a fallback to localStorage for development.
 */
export const storage = {
  get: async (keys: string[]): Promise<Record<string, any>> => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return await chrome.storage.local.get(keys);
    } else {
      // Fallback for dev environment
      const result: Record<string, any> = {};
      keys.forEach((key) => {
        const val = localStorage.getItem(key);
        if (val) {
          try {
            result[key] = JSON.parse(val);
          } catch {
            result[key] = val;
          }
        }
      });
      return result;
    }
  },
  set: async (items: Record<string, any>): Promise<void> => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      await chrome.storage.local.set(items);
    } else {
      // Fallback for dev environment
      Object.keys(items).forEach((key) => {
        localStorage.setItem(key, JSON.stringify(items[key]));
      });
    }
  },
};
