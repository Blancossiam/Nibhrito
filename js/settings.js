/**
 * settings.js — Settings drawer logic
 *
 * Manages:
 *   - Opening/closing the settings drawer
 *   - Provider tab switching
 *   - Playlist URL input + validation
 *   - Load / Clear actions
 *   - Spotify embed visibility (drawer stays open for Spotify)
 *   - Background image upload (client-side only, never uploaded to server)
 *   - Custom background clear
 */

import { Storage } from './storage.js';
import { YouTubeProvider } from './providers/youtube.js';
import { SpotifyProvider  } from './providers/spotify.js';

const MAX_BG_SIZE = 8 * 1024 * 1024; // 8 MB

export class Settings {
  /**
   * @param {Function} onLoad  - callback(providerType, url)
   * @param {Function} onClear - callback()
   * @param {BgManager} bgManager - background manager instance
   */
  constructor(onLoad, onClear, bgManager) {
    this.onLoad    = onLoad;
    this.onClear   = onClear;
    this.bgManager = bgManager;

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

    // Background upload refs
    this.$bgUploadInput = document.getElementById('bg-upload-input');
    this.$btnClearBg    = document.getElementById('btn-clear-bg');
    this.$bgUploadError = document.getElementById('bg-upload-error');
    this.$bgPreview     = document.getElementById('bg-upload-preview');

    // State
    this.activeProvider = Storage.getProvider();  // 'youtube' | 'spotify'
    this.isOpen = false;
    this._isSpotifyLoaded = false; // track if Spotify embed is active

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

    // ── Background upload ──────────────────────────────────
    if (this.$bgUploadInput) {
      this.$bgUploadInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        this._handleBgUpload(file);
      });
    }

    if (this.$btnClearBg) {
      this.$btnClearBg.addEventListener('click', () => this._handleClearBg());
    }
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
    // Show the embed if we have a valid stored Spotify URL
    const savedUrl = Storage.getPlaylistUrl();
    if (savedUrl && SpotifyProvider.validateUrl(savedUrl) && this.activeProvider === 'spotify') {
      this.$spotifyWrap.classList.add('visible');
    }
  }

  _hideSpotifyEmbed() {
    this.$spotifyWrap.classList.remove('visible');
  }

  // ── Provider note ───────────────────────────────────────────
  _updateProviderNote() {
    // Use DOM construction instead of innerHTML to prevent any XSS risk
    const note = this.$providerNote;
    note.textContent = ''; // clear

    if (this.activeProvider === 'youtube') {
      const line1 = document.createElement('span');
      line1.appendChild(this._strong('YouTube'));
      line1.appendChild(document.createTextNode(' playlist or video URL — e.g.'));
      note.appendChild(line1);
      note.appendChild(document.createElement('br'));

      const example = document.createElement('em');
      example.style.cssText = 'opacity:0.65;font-size:0.7rem';
      example.textContent = 'youtube.com/playlist?list=PL...  or  youtu.be/xxxxx';
      note.appendChild(example);
      note.appendChild(document.createElement('br'));
      note.appendChild(document.createElement('br'));

      const line2 = document.createTextNode('Controls play, pause, next, previous, seek and volume.');
      note.appendChild(line2);
      note.appendChild(document.createElement('br'));

      const line3 = document.createTextNode('Music plays through the official YouTube embed.');
      note.appendChild(line3);
    } else {
      const line1 = document.createElement('span');
      line1.appendChild(this._strong('Spotify'));
      line1.appendChild(document.createTextNode(' track, album, or playlist URL — e.g.'));
      note.appendChild(line1);
      note.appendChild(document.createElement('br'));

      const example = document.createElement('em');
      example.style.cssText = 'opacity:0.65;font-size:0.7rem';
      example.textContent = 'open.spotify.com/playlist/...';
      note.appendChild(example);
      note.appendChild(document.createElement('br'));
      note.appendChild(document.createElement('br'));

      const warn = document.createTextNode('The Spotify player appears below. Full playback requires being logged into Spotify in your browser. 30-second previews are available without login.');
      note.appendChild(this._strong('Note: '));
      note.appendChild(warn);
    }
  }

  _strong(text) {
    const el = document.createElement('strong');
    el.textContent = text;
    return el;
  }

  // ── Load ────────────────────────────────────────────────────
  _handleLoad() {
    const rawUrl = this.$urlInput.value.trim();
    if (!rawUrl) {
      this._showError('Please paste a playlist or video URL.');
      return;
    }

    // Basic URL sanity check before validation
    let url;
    try {
      url = new URL(rawUrl);
    } catch {
      this._showError('Please enter a valid URL starting with https://');
      return;
    }

    // Only allow https
    if (url.protocol !== 'https:') {
      this._showError('Only HTTPS URLs are accepted for security.');
      return;
    }

    const isYT = YouTubeProvider.validateUrl(rawUrl);
    const isSP = SpotifyProvider.validateUrl(rawUrl);

    if (this.activeProvider === 'youtube' && !isYT) {
      this._showError('Please enter a valid YouTube playlist or video URL.');
      return;
    }
    if (this.activeProvider === 'spotify' && !isSP) {
      this._showError('Please enter a valid Spotify track, album, or playlist URL.');
      return;
    }

    Storage.setPlaylistUrl(rawUrl);
    Storage.setProvider(this.activeProvider);

    if (this.activeProvider === 'spotify') {
      // Show the embed in the drawer
      this.$spotifyWrap.classList.add('visible');
      this._isSpotifyLoaded = true;
      // Call load but do NOT close the drawer — user must interact with
      // the Spotify embed widget, which is inside this drawer
      this.onLoad(this.activeProvider, rawUrl);
      // Keep drawer open; show a note
    } else {
      this.onLoad(this.activeProvider, rawUrl);
      this.close();
    }
  }

  // ── Clear ───────────────────────────────────────────────────
  _handleClear() {
    this.$urlInput.value = '';
    this._clearError();
    this.$spotifyWrap.classList.remove('visible');
    this.$spotifyIframe.removeAttribute('src');
    this._isSpotifyLoaded = false;
    Storage.clearPlaylist();
    this.onClear();
  }

  // ── Background upload ────────────────────────────────────────
  _handleBgUpload(file) {
    this._clearBgError();

    // Validate MIME
    if (!file.type.startsWith('image/')) {
      this._showBgError('Only image files are supported (JPG, PNG, GIF, WebP, etc.).');
      // Reset the input so the same file can be re-selected after fix
      this.$bgUploadInput.value = '';
      return;
    }

    // Validate size
    if (file.size > MAX_BG_SIZE) {
      const mb = (MAX_BG_SIZE / (1024 * 1024)).toFixed(0);
      this._showBgError(`Image must be smaller than ${mb} MB. Please choose a smaller file.`);
      this.$bgUploadInput.value = '';
      return;
    }

    // Apply — entirely client-side, no network request
    const result = this.bgManager.setCustom(file);
    if (!result.ok) {
      this._showBgError(result.error);
      this.$bgUploadInput.value = '';
      return;
    }

    // Show thumbnail preview and activate clear button
    if (this.$bgPreview) {
      // Revoke any existing preview URL to avoid memory leaks
      if (this.$bgPreview.dataset.blobUrl) {
        URL.revokeObjectURL(this.$bgPreview.dataset.blobUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      this.$bgPreview.dataset.blobUrl = previewUrl;
      this.$bgPreview.style.backgroundImage = `url(${CSS.escape ? `"${previewUrl}"` : previewUrl})`;
      this.$bgPreview.classList.add('has-image');
    }
    if (this.$btnClearBg) {
      this.$btnClearBg.classList.add('visible');
    }
  }

  _handleClearBg() {
    this.bgManager.clearCustom();

    // Reset preview
    if (this.$bgPreview) {
      if (this.$bgPreview.dataset.blobUrl) {
        URL.revokeObjectURL(this.$bgPreview.dataset.blobUrl);
        delete this.$bgPreview.dataset.blobUrl;
      }
      this.$bgPreview.style.backgroundImage = '';
      this.$bgPreview.classList.remove('has-image');
    }

    // Reset file input
    if (this.$bgUploadInput) this.$bgUploadInput.value = '';
    if (this.$btnClearBg)    this.$btnClearBg.classList.remove('visible');
    this._clearBgError();
  }

  // ── Error display ───────────────────────────────────────────
  _showError(msg) {
    // textContent — never innerHTML — to prevent XSS
    this.$errorMsg.textContent = msg;
    this.$errorMsg.classList.add('visible');
    this.$urlInput.classList.add('error');
    this.$urlInput.focus();
  }

  _clearError() {
    this.$errorMsg.classList.remove('visible');
    this.$urlInput.classList.remove('error');
  }

  _showBgError(msg) {
    if (!this.$bgUploadError) return;
    this.$bgUploadError.textContent = msg;
    this.$bgUploadError.classList.add('visible');
  }

  _clearBgError() {
    if (!this.$bgUploadError) return;
    this.$bgUploadError.classList.remove('visible');
    this.$bgUploadError.textContent = '';
  }

  // ── Expose Spotify iframe for provider to use ───────────────
  getSpotifyIframe() {
    return this.$spotifyIframe;
  }
}
