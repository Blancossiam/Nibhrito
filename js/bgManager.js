/**
 * bgManager.js — Background management
 *
 * Handles three background layers:
 *   1. #bg-video  — the default moonlit river video (always present, z-index 0)
 *   2. #bg-dynamic — dynamic photo fetched per-track via /api/bg (z-index 1)
 *   3. Custom upload — user's own image, overrides both (applied to #bg-dynamic)
 *
 * Priority: custom upload > dynamic fetch > default video
 *
 * The cross-fade is driven by a CSS opacity transition on #bg-dynamic.
 * sessionStorage caches fetched URLs per track title to avoid repeat requests.
 *
 * Drag-to-reposition:
 *   When a custom image is active, the user can enter reposition mode.
 *   Dragging the background updates object-position in real time.
 */

import { Storage } from './storage.js';

const CACHE_PREFIX   = 'moonlit_bg_';
const BG_FETCH_PATH  = '/api/bg';
const MAX_FILE_SIZE  = 8 * 1024 * 1024; // 8 MB
const FADE_DURATION  = 1200;             // ms — matches CSS transition

export class BgManager {
  constructor() {
    this.$bgVideo   = document.getElementById('bg-video');
    this.$bgDynamic = document.getElementById('bg-dynamic');
    this.$repoBtn   = document.getElementById('reposition-btn');
    this.$repoOverlay = document.getElementById('reposition-overlay');
    this.$repoDone  = document.getElementById('reposition-done');

    // State
    this._customObjectUrl  = null;   // blob: URL for uploaded image
    this._hasCustom        = false;
    this._currentDynamicUrl = null;
    this._pendingFetch     = null;   // AbortController for in-flight fetch

    // Reposition state
    this._position = { x: 50, y: 50 }; // object-position percentages
    this._isRepositioning = false;
    this._dragStart = null;            // { clientX, clientY, posX, posY }

    this._initRepositionControls();
  }

  // ── Reposition controls ──────────────────────────────────────
  _initRepositionControls() {
    if (this.$repoBtn) {
      this.$repoBtn.addEventListener('click', () => this.enterRepositionMode());
    }

    if (this.$repoDone) {
      this.$repoDone.addEventListener('click', () => this.exitRepositionMode());
    }

    // Keyboard: Escape exits reposition mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isRepositioning) {
        this.exitRepositionMode();
      }
    });
  }

  enterRepositionMode() {
    if (!this._hasCustom || !this.$bgDynamic) return;
    this._isRepositioning = true;

    document.body.classList.add('reposition-active');
    if (this.$repoOverlay) this.$repoOverlay.classList.add('active');
    if (this.$repoBtn) this.$repoBtn.hidden = true;

    // Wire drag events onto the bg-dynamic element
    this.$bgDynamic.style.pointerEvents = 'all';
    this.$bgDynamic.addEventListener('pointerdown', this._onPointerDown);
  }

  exitRepositionMode() {
    this._isRepositioning = false;

    document.body.classList.remove('reposition-active', 'dragging');
    if (this.$repoOverlay) this.$repoOverlay.classList.remove('active');
    if (this.$repoBtn) this.$repoBtn.hidden = false;

    // Remove drag events
    if (this.$bgDynamic) {
      this.$bgDynamic.style.pointerEvents = '';
      this.$bgDynamic.removeEventListener('pointerdown', this._onPointerDown);
    }

    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup',   this._onPointerUp);
  }

  // Arrow functions so `this` is always bound correctly
  _onPointerDown = (e) => {
    e.preventDefault();
    this._dragStart = {
      clientX: e.clientX,
      clientY: e.clientY,
      posX: this._position.x,
      posY: this._position.y,
    };
    document.body.classList.add('dragging');
    document.addEventListener('pointermove', this._onPointerMove);
    document.addEventListener('pointerup',   this._onPointerUp);
  };

  _onPointerMove = (e) => {
    if (!this._dragStart) return;

    const dx = e.clientX - this._dragStart.clientX;
    const dy = e.clientY - this._dragStart.clientY;

    // Sensitivity: 100px of drag = 25% position change
    const sensitivity = 0.25;
    const newX = Math.max(0, Math.min(100, this._dragStart.posX - dx * sensitivity));
    const newY = Math.max(0, Math.min(100, this._dragStart.posY - dy * sensitivity));

    this._position = { x: newX, y: newY };
    this._applyPosition();
  };

  _onPointerUp = () => {
    this._dragStart = null;
    document.body.classList.remove('dragging');
    document.removeEventListener('pointermove', this._onPointerMove);
    document.removeEventListener('pointerup',   this._onPointerUp);
  };

  _applyPosition() {
    if (!this.$bgDynamic) return;
    this.$bgDynamic.style.objectPosition = `${this._position.x}% ${this._position.y}%`;
  }

  // ── Show / hide reposition button ───────────────────────────
  showRepositionButton(visible) {
    if (!this.$repoBtn) return;
    this.$repoBtn.hidden = !visible;
    if (!visible && this._isRepositioning) {
      this.exitRepositionMode();
    }
  }

  /**
   * Called by app.js when a track changes.
   * Ignored if the user has a custom background set.
   * Non-blocking: playback starts; background swaps when fetch resolves.
   */
  async setDynamic(trackTitle, trackAuthor = '') {
    if (this._hasCustom) return;
    if (!trackTitle) return;

    // Respect the user's opt-in preference — off by default
    if (!Storage.getAutoBg()) return;

    // Build a mood-based search query (title + author keeps it focused)
    const query = this._buildQuery(trackTitle, trackAuthor);

    // Check sessionStorage cache first
    const cacheKey = CACHE_PREFIX + this._hashKey(query);
    const cached   = this._readCache(cacheKey);
    if (cached) {
      this._crossFadeTo(cached);
      return;
    }

    // Abort any previous in-flight request
    if (this._pendingFetch) {
      this._pendingFetch.abort();
    }
    this._pendingFetch = new AbortController();

    try {
      const url = new URL(BG_FETCH_PATH, window.location.origin);
      url.searchParams.set('q', query);

      const res = await fetch(url.toString(), {
        method: 'GET',
        signal: this._pendingFetch.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.url) {
        this._writeCache(cacheKey, data.url);
        this._crossFadeTo(data.url);
      } else {
        // No result — fall back to default video
        this._showDefaultVideo();
      }
    } catch (err) {
      if (err.name === 'AbortError') return; // intentional abort, do nothing
      // Network or API failure — fall back gracefully
      this._showDefaultVideo();
    } finally {
      this._pendingFetch = null;
    }
  }

  /**
   * Apply a user-uploaded image as the background.
   * Returns true on success, false if validation fails.
   */
  setCustom(file) {
    // Validate MIME type
    if (!file.type.startsWith('image/')) {
      return { ok: false, error: 'Only image files are supported.' };
    }
    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      const mb = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
      return { ok: false, error: `Image must be smaller than ${mb} MB.` };
    }

    // Revoke previous object URL to avoid memory leak
    if (this._customObjectUrl) {
      URL.revokeObjectURL(this._customObjectUrl);
    }

    // Reset position to center when a new image is uploaded
    this._position = { x: 50, y: 50 };

    this._customObjectUrl = URL.createObjectURL(file);
    this._hasCustom       = true;

    this._crossFadeTo(this._customObjectUrl, /* hideVideo */ true);
    return { ok: true };
  }

  /**
   * Remove custom background and resume dynamic / default behaviour.
   */
  clearCustom() {
    if (this._customObjectUrl) {
      URL.revokeObjectURL(this._customObjectUrl);
      this._customObjectUrl = null;
    }
    this._hasCustom = false;
    this._position  = { x: 50, y: 50 };

    // Reset object-position
    if (this.$bgDynamic) {
      this.$bgDynamic.style.objectPosition = '';
    }

    if (this._currentDynamicUrl) {
      this._crossFadeTo(this._currentDynamicUrl);
    } else {
      this._showDefaultVideo();
    }
  }

  /**
   * Show only the default video (fade out the dynamic layer).
   */
  _showDefaultVideo() {
    if (!this.$bgDynamic) return;
    this.$bgDynamic.classList.remove('visible');
    // Restore video visibility in case it was hidden
    if (this.$bgVideo) {
      this.$bgVideo.style.opacity = '1';
    }
  }

  /**
   * Cross-fade #bg-dynamic to a new image URL.
   */
  _crossFadeTo(imageUrl, hideVideo = false) {
    if (!this.$bgDynamic) return;

    const img = this.$bgDynamic;

    // Preload the new image before showing it
    const preload = new Image();
    preload.onload = () => {
      img.src = imageUrl;
      img.classList.add('visible');
      this._currentDynamicUrl = imageUrl;

      // Apply saved position for custom images
      if (hideVideo) {
        this._applyPosition();
      }

      if (hideVideo && this.$bgVideo) {
        // Dim the video layer so only the image shows
        this.$bgVideo.style.opacity = '0';
      } else if (this.$bgVideo) {
        this.$bgVideo.style.opacity = '1';
      }
    };
    preload.onerror = () => {
      // Preload failed — stay on current background
      this._showDefaultVideo();
    };
    preload.src = imageUrl;
  }

  // ── Search query builder ────────────────────────────────────
  _buildQuery(title, author) {
    // Strip common filler words from song titles for better Pexels results
    const stopWords = /\b(official|video|lyrics|audio|ft|feat|remix|mix|version|mv|hd|4k|vevo)\b/gi;
    const cleanTitle = title.replace(stopWords, '').replace(/[^\w\s]/g, ' ').trim();

    // Build query: "title by author ambient nature" — the "ambient nature"
    // bias keeps results atmospheric rather than literal
    const parts = [cleanTitle];
    if (author && author !== 'Unknown Artist' && author.length < 40) {
      // Only include author if it's not a YouTube channel name
      const cleanAuthor = author.replace(/vevo|official|music|records|entertainment/gi, '').trim();
      if (cleanAuthor.length > 2) parts.push(cleanAuthor);
    }
    parts.push('nature landscape');

    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  // ── sessionStorage cache helpers ────────────────────────────
  _hashKey(str) {
    // Simple 32-bit hash — just for a cache key, not for security
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }

  _readCache(key) {
    try { return sessionStorage.getItem(key) || null; } catch { return null; }
  }

  _writeCache(key, value) {
    try { sessionStorage.setItem(key, value); } catch { /* quota exceeded */ }
  }
}
