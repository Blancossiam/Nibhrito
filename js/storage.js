/**
 * storage.js — localStorage persistence
 * Handles saving and loading user preferences.
 */

const KEYS = {
  PROVIDER:     'moonlit_provider',
  PLAYLIST_URL: 'moonlit_playlist_url',
  VOLUME:       'moonlit_volume',
};

export const Storage = {
  get(key, fallback = null) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? val : fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Storage unavailable (private browsing, quota exceeded) — fail silently
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch { /* */ }
  },

  getProvider()     { return this.get(KEYS.PROVIDER, 'youtube'); },
  setProvider(v)    { this.set(KEYS.PROVIDER, v); },

  getPlaylistUrl()  { return this.get(KEYS.PLAYLIST_URL, ''); },
  setPlaylistUrl(v) { this.set(KEYS.PLAYLIST_URL, v); },

  getVolume()       { return parseFloat(this.get(KEYS.VOLUME, '0.75')); },
  setVolume(v)      { this.set(KEYS.VOLUME, v); },

  clearPlaylist() {
    this.remove(KEYS.PLAYLIST_URL);
  },
};
