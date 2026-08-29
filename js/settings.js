/**
 * settings.js — Settings drawer logic
 *
 * Manages:
 *   - Opening/closing the settings drawer
 *   - Provider tab switching
 *   - Playlist URL input + validation
 *   - Load / Clear actions
 *   - Spotify embed visibility
 */

import { Storage } from './storage.js';
import { YouTubeProvider } from './providers/youtube.js';
import { SpotifyProvider  } from './providers/spotify.js';

export class Settings {
  constructor(onLoad, onClear) {
    this.onLoad  = onLoad;   // callback(provider, type, url)
    this.onClear = onClear;  // callback()

    // DOM refs
    this.$overlay       = document.getElementById('settings-overlay');
    this.$drawer        = document.getElementById('settings-drawer');
    this.$closeBtn      = document.getElementById('settings-close');
    this.$settingsBtn   = document.getElementById('settings-btn');
    this.$emptyBtn      = document.getElementById('empty-open-settings');
    this.$providerTabs  = document.querySelectorAll('.provider-tab');
    this.$urlInput      = document.getElementById('playlist-url-input');
    this.$errorMsg      = document.getElementById('url-error-msg');
    this.$btnLoad       = document.getElementById('btn-load-playlist');
    this.$btnClear      = document.getElementById('btn-clear-playlist');
    this.$spotifyWrap   = document.getElementById('spotify-embed-wrap');
    this.$spotifyIframe = document.getElementById('spotify-iframe');
    this.$providerNote  = document.getElementById('provider-note');

    // State
    this.activeProvider = Storage.getProvider();  // 'youtube' | 'spotify'
    this.isOpen = false;

    this._init();
  }

  _init() {
    // Restore saved state
    this.$urlInput.value = Storage.getPlaylistUrl();
    this._setActiveTab(this.activeProvider);
    this._updateProviderNote();

    // Open settings — button in player
    this.$settingsBtn.addEventListener('click', () => this.open());

    // Open settings — empty state button
    this.$emptyBtn?.addEventListener('click', () => this.open());

    // Close — X button
    this.$closeBtn.addEventListener('click', () => this.close());

    // Close — overlay click
    this.$overlay.addEventListener('click', (e) => {
      if (e.target === this.$overlay) this.close();
    });

    // Close — ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });

    // Provider tabs
    this.$providerTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this._setActiveTab(tab.dataset.provider);
        Storage.setProvider(tab.dataset.provider);
        this._updateProviderNote();
        this._clearError();
      });
    });

    // URL input — clear error on type
    this.$urlInput.addEventListener('input', () => this._clearError());

    // URL input — Enter to load
    this.$urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._handleLoad();
    });

    // Load button
    this.$btnLoad.addEventListener('click', () => this._handleLoad());

    // Clear button
    this.$btnClear.addEventListener('click', () => this._handleClear());
  }

  // ── Open / Close ────────────────────────────────────────────
  open() {
    this.isOpen = true;
    this.$overlay.classList.add('open');
    this.$drawer.classList.add('open');
    this.$drawer.setAttribute('aria-hidden', 'false');
    // Focus the URL input for keyboard users
    setTimeout(() => this.$urlInput.focus(), 350);
  }

  close() {
    this.isOpen = false;
    this.$overlay.classList.remove('open');
    this.$drawer.classList.remove('open');
    this.$drawer.setAttribute('aria-hidden', 'true');
    // Return focus to settings button
    this.$settingsBtn.focus();
  }

  // ── Provider tabs ───────────────────────────────────────────
  _setActiveTab(provider) {
    this.activeProvider = provider;
    this.$providerTabs.forEach((tab) => {
      const isActive = tab.dataset.provider === provider;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive);
    });
    // Show/hide Spotify embed
    if (provider === 'spotify') {
      this._showSpotifyEmbed();
    } else {
      this._hideSpotifyEmbed();
    }
  }

  _showSpotifyEmbed() {
    const savedUrl = Storage.getPlaylistUrl();
    if (savedUrl && SpotifyProvider.validateUrl(savedUrl) && this.activeProvider === 'spotify') {
      this.$spotifyWrap.classList.add('visible');
    }
  }

  _hideSpotifyEmbed() {
    // Keep but hide; will show when Spotify is active with valid URL
    this.$spotifyWrap.classList.remove('visible');
  }

  // ── Provider note ───────────────────────────────────────────
  _updateProviderNote() {
    if (this.activeProvider === 'youtube') {
      this.$providerNote.innerHTML = `
        Paste a <strong>YouTube playlist URL</strong> — e.g.<br>
        <em style="opacity:0.65;font-size:0.7rem">youtube.com/playlist?list=PL...</em><br><br>
        Controls play, pause, next, previous, seek and volume.<br>
        Music plays through the official YouTube embed.
      `;
    } else {
      this.$providerNote.innerHTML = `
        Paste a <strong>Spotify playlist URL</strong> — e.g.<br>
        <em style="opacity:0.65;font-size:0.7rem">open.spotify.com/playlist/...</em><br><br>
        <strong>Note:</strong> Full playback requires being logged into Spotify in your browser.
        30-second previews are available without login. The Spotify player appears below.
      `;
    }
  }

  // ── Load ────────────────────────────────────────────────────
  _handleLoad() {
    const url = this.$urlInput.value.trim();
    if (!url) {
      this._showError('Please paste a playlist URL.');
      return;
    }

    const isYT  = YouTubeProvider.validateUrl(url);
    const isSP  = SpotifyProvider.validateUrl(url);

    if (this.activeProvider === 'youtube' && !isYT) {
      this._showError('Please enter a valid YouTube playlist URL.');
      return;
    }
    if (this.activeProvider === 'spotify' && !isSP) {
      this._showError('Please enter a valid Spotify playlist or album URL.');
      return;
    }

    Storage.setPlaylistUrl(url);
    Storage.setProvider(this.activeProvider);

    if (this.activeProvider === 'spotify') {
      this.$spotifyWrap.classList.add('visible');
    }

    this.onLoad(this.activeProvider, url);
    this.close();
  }

  // ── Clear ───────────────────────────────────────────────────
  _handleClear() {
    this.$urlInput.value = '';
    this._clearError();
    this.$spotifyWrap.classList.remove('visible');
    this.$spotifyIframe.src = '';
    Storage.clearPlaylist();
    this.onClear();
  }

  // ── Error display ───────────────────────────────────────────
  _showError(msg) {
    this.$errorMsg.textContent = msg;
    this.$errorMsg.classList.add('visible');
    this.$urlInput.classList.add('error');
    this.$urlInput.focus();
  }

  _clearError() {
    this.$errorMsg.classList.remove('visible');
    this.$urlInput.classList.remove('error');
  }

  // ── Expose Spotify iframe for provider to use ───────────────
  getSpotifyIframe() {
    return this.$spotifyIframe;
  }
}
