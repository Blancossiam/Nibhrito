/**
 * app.js — Main application entry point
 *
 * Orchestrates:
 *   - Player UI
 *   - Settings drawer
 *   - Provider loading (YouTube / Spotify)
 *   - State transitions
 *   - Toast notifications
 *   - Persistence restore on load
 */

import { Player }                from './player.js';
import { Settings }               from './settings.js';
import { YouTubeProvider }        from './providers/youtube.js';
import { SpotifyProvider }        from './providers/spotify.js';
import { Storage }                from './storage.js';

// ── Error messages (user-friendly) ──────────────────────────
const ERROR_MESSAGES = {
  'invalid_url':          "This playlist link isn't supported.",
  'playback_unavailable': "Playback isn't available for this playlist.",
  'embed_not_allowed':    "This playlist can't be embedded. Try a different one.",
  'not_found':            "We couldn't find that playlist.",
  'playback_error':       "Something went wrong with playback.",
  'timeout':              "Loading timed out. Please try again.",
  'network':              "Network error — please check your connection.",
  'default':              "We couldn't load the playlist. Please try again.",
};

function friendlyError(code) {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES['default'];
}

class MoonlitRiverApp {
  constructor() {
    this.player   = new Player();
    this.settings = new Settings(
      (providerType, url) => this._loadPlaylist(providerType, url),
      ()                  => this._clearPlaylist()
    );

    this.ytProvider = null;
    this.spProvider = null;
    this.activeProviderType = null;

    this._toastTimer = null;

    this._init();
  }

  async _init() {
    // Restore saved preferences
    const savedUrl      = Storage.getPlaylistUrl();
    const savedProvider = Storage.getProvider();
    const savedVolume   = Storage.getVolume();

    // Apply saved volume to player UI
    this.player.volume = savedVolume;
    const $volSlider = document.getElementById('volume-slider');
    if ($volSlider) $volSlider.value = savedVolume;

    // Auto-restore saved playlist
    if (savedUrl) {
      // Small delay to allow DOM to settle
      setTimeout(() => {
        this._loadPlaylist(savedProvider, savedUrl, true);
      }, 500);
    }
  }

  // ── Load Playlist ────────────────────────────────────────────
  async _loadPlaylist(providerType, url, silent = false) {
    // Destroy existing providers
    this._destroyProviders();
    this.activeProviderType = providerType;

    this.player.setState('loading');

    try {
      if (providerType === 'youtube') {
        await this._loadYouTube(url);
      } else if (providerType === 'spotify') {
        await this._loadSpotify(url);
      }
    } catch (err) {
      const code = err.message || 'default';
      this.player.setState('error');
      this.player.setState('empty'); // fall back to empty visually
      if (!silent) this._showToast(friendlyError(code), 'error');
      console.warn('[MoonlitRiver] Load error:', err);
    }
  }

  // ── YouTube ──────────────────────────────────────────────────
  async _loadYouTube(url) {
    this.ytProvider = new YouTubeProvider('yt-player-wrap');

    // Apply saved volume
    this.ytProvider._volume = Storage.getVolume();

    // Bind events
    this.ytProvider.on('state', (state) => {
      this.player.setState(state);
    });

    this.ytProvider.on('track', (info) => {
      this.player.setTrackInfo(info);
    });

    this.ytProvider.on('progress', (data) => {
      this.player.setProgress(data);
    });

    this.ytProvider.on('error', (code) => {
      this.player.setState('empty');
      this._showToast(friendlyError(code), 'error');
    });

    this.player.setProvider(this.ytProvider, 'youtube');
    await this.ytProvider.loadPlaylist(url);
  }

  // ── Spotify ──────────────────────────────────────────────────
  async _loadSpotify(url) {
    this.spProvider = new SpotifyProvider();

    this.spProvider.on('state', (state) => {
      this.player.setState(state);
    });

    this.spProvider.on('track', (info) => {
      this.player.setTrackInfo(info);
    });

    this.spProvider.on('progress', (data) => {
      this.player.setProgress(data);
    });

    this.spProvider.on('error', (code) => {
      this.player.setState('empty');
      this._showToast(friendlyError(code), 'error');
    });

    this.player.setProvider(this.spProvider, 'spotify');

    const iframe = this.settings.getSpotifyIframe();
    await this.spProvider.loadPlaylist(url, iframe);
  }

  // ── Clear ────────────────────────────────────────────────────
  _clearPlaylist() {
    this._destroyProviders();
    this.player.setProvider(null, null);
    this.player.setState('empty');
    this._showToast('Playlist cleared.');
  }

  _destroyProviders() {
    this.ytProvider?.destroy();
    this.spProvider?.destroy();
    this.ytProvider = null;
    this.spProvider = null;
  }

  // ── Toast ────────────────────────────────────────────────────
  _showToast(message, type = 'info') {
    const $toast = document.getElementById('toast');
    if (!$toast) return;
    $toast.textContent = message;
    $toast.className = 'visible' + (type === 'error' ? ' error' : '');

    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      $toast.className = '';
    }, 3800);
  }
}

// ── Boot ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window._moonlitApp = new MoonlitRiverApp();
});
