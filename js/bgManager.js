/**
 * bgManager.js — Background management
 *
 * Handles three background layers:
 *   1. #bg-video    — default moonlit river video (z-index 0)
 *   2. #bg-dynamic  — dynamic photo per-track via /api/bg, or custom image (z-index 1)
 *   3. Custom upload — user's own image with crop/position control
 *
 * Priority: custom upload > dynamic fetch > default video
 *
 * Crop modal:
 *   Opens immediately when a user selects an image.
 *   Provides drag-to-reposition, position presets, and Fill/Fit display modes.
 *   User confirms with "Apply" before the image becomes the background.
 */

import { Storage } from './storage.js';

const CACHE_PREFIX  = 'moonlit_bg_';
const BG_FETCH_PATH = '/api/bg';
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

export class BgManager {
  constructor() {
    this.$bgVideo   = document.getElementById('bg-video');
    this.$bgDynamic = document.getElementById('bg-dynamic');

    // Runtime state
    this._customObjectUrl   = null;
    this._hasCustom         = false;
    this._currentDynamicUrl = null;
    this._pendingFetch      = null;

    // Crop modal state
    this._cropFile       = null;
    this._cropPosition   = { x: 50, y: 50 };
    this._cropFit        = 'cover';
    this._cropDragStart  = null;
    this._onApplyCallback = null;

    // Crop modal DOM refs
    this.$cropModal    = document.getElementById('crop-modal');
    this.$cropViewport = document.getElementById('crop-preview-viewport');
    this.$cropImg      = document.getElementById('crop-preview-img');
    this.$cropApply    = document.getElementById('crop-apply-btn');
    this.$cropCancel   = document.getElementById('crop-cancel-btn');
    this.$cropCancelX  = document.getElementById('crop-cancel-x');

    this._initCropModal();
  }

  // ── Crop Modal Setup ─────────────────────────────────────────
  _initCropModal() {
    this.$cropApply?.addEventListener('click', () => this._applyCrop());
    this.$cropCancel?.addEventListener('click', () => this._closeCropModal());
    this.$cropCancelX?.addEventListener('click', () => this._closeCropModal());

    // Backdrop click closes
    this.$cropModal?.addEventListener('click', (e) => {
      if (e.target === this.$cropModal) this._closeCropModal();
    });

    // Escape closes
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.$cropModal?.classList.contains('open')) {
        this._closeCropModal();
      }
    });

    // Position preset buttons
    document.querySelectorAll('.crop-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._cropPosition = { x: parseFloat(btn.dataset.x), y: parseFloat(btn.dataset.y) };
        this._updateCropPreview();
        document.querySelectorAll('.crop-preset').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Fit/fill buttons
    document.querySelectorAll('.crop-fit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._cropFit = btn.dataset.fit;
        this._updateCropPreview();
        document.querySelectorAll('.crop-fit-btn').forEach((b) => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
        // Dim presets when "Fit" mode (position doesn't matter for contain)
        const presetsEl = document.getElementById('crop-presets');
        if (presetsEl) {
          const disabled = this._cropFit === 'contain';
          presetsEl.style.opacity = disabled ? '0.35' : '1';
          presetsEl.style.pointerEvents = disabled ? 'none' : '';
        }
      });
    });
  }

  /**
   * Open the crop modal for a file.
   * onApply(file) is called when the user confirms.
   */
  openCropModal(file, onApply) {
    this._cropFile         = file;
    this._onApplyCallback  = onApply;
    this._cropPosition     = { x: 50, y: 50 };
    this._cropFit          = 'cover';

    // Reset UI state
    document.querySelectorAll('.crop-preset').forEach((b, i) => {
      b.classList.toggle('active', b.dataset.x === '50' && b.dataset.y === '50');
    });
    document.querySelectorAll('.crop-fit-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.fit === 'cover');
      b.setAttribute('aria-pressed', b.dataset.fit === 'cover' ? 'true' : 'false');
    });
    const presetsEl = document.getElementById('crop-presets');
    if (presetsEl) { presetsEl.style.opacity = ''; presetsEl.style.pointerEvents = ''; }

    // Load image into preview
    if (this.$cropImg) {
      if (this.$cropImg._tempUrl) URL.revokeObjectURL(this.$cropImg._tempUrl);
      const tempUrl = URL.createObjectURL(file);
      this.$cropImg._tempUrl = tempUrl;
      this.$cropImg.src = tempUrl;
    }
    this._updateCropPreview();

    // Show modal
    this.$cropModal?.removeAttribute('aria-hidden');
    this.$cropModal?.setAttribute('aria-hidden', 'false');
    this.$cropModal?.classList.add('open');

    // Wire drag on viewport
    this._setupCropDrag();
  }

  _closeCropModal() {
    this.$cropModal?.classList.remove('open');
    this.$cropModal?.setAttribute('aria-hidden', 'true');
    if (this.$cropViewport) this.$cropViewport.classList.remove('dragging', 'has-dragged');

    // Revoke temp preview URL
    if (this.$cropImg?._tempUrl) {
      URL.revokeObjectURL(this.$cropImg._tempUrl);
      this.$cropImg._tempUrl = null;
      this.$cropImg.src = '';
    }

    this._removeCropDrag();
    this._cropFile = null;
    this._onApplyCallback = null;
  }

  _applyCrop() {
    if (!this._cropFile) return;

    const file     = this._cropFile;
    const position = { ...this._cropPosition };
    const fit      = this._cropFit;
    const callback = this._onApplyCallback;

    // Close modal (revokes temp preview URL)
    this._closeCropModal();

    // Apply image to background
    this._applyCustomImage(file, position, fit);

    callback?.(file);
  }

  _applyCustomImage(file, position, fit) {
    if (this._customObjectUrl) URL.revokeObjectURL(this._customObjectUrl);

    this._customObjectUrl = URL.createObjectURL(file);
    this._hasCustom       = true;

    this._crossFadeTo(this._customObjectUrl, true, position, fit);
  }

  _updateCropPreview() {
    if (!this.$cropImg) return;
    this.$cropImg.style.objectFit      = this._cropFit;
    this.$cropImg.style.objectPosition = `${this._cropPosition.x}% ${this._cropPosition.y}%`;
  }

  // ── Drag-in-preview ─────────────────────────────────────────
  _setupCropDrag() {
    this.$cropViewport?.addEventListener('pointerdown', this._cropDown);
  }

  _removeCropDrag() {
    this.$cropViewport?.removeEventListener('pointerdown', this._cropDown);
    document.removeEventListener('pointermove', this._cropMove);
    document.removeEventListener('pointerup',   this._cropUp);
  }

  _cropDown = (e) => {
    e.preventDefault();
    this._cropDragStart = {
      clientX: e.clientX,
      clientY: e.clientY,
      posX: this._cropPosition.x,
      posY: this._cropPosition.y,
    };
    this.$cropViewport?.classList.add('dragging');
    document.addEventListener('pointermove', this._cropMove);
    document.addEventListener('pointerup',   this._cropUp);
    document.querySelectorAll('.crop-preset').forEach((b) => b.classList.remove('active'));
  };

  _cropMove = (e) => {
    if (!this._cropDragStart || !this.$cropViewport) return;

    const rect = this.$cropViewport.getBoundingClientRect();
    const dx = e.clientX - this._cropDragStart.clientX;
    const dy = e.clientY - this._cropDragStart.clientY;

    // Convert pixel delta → position percentage
    // Dragging right means user wants to see more of the left side → x decreases
    const sx = (100 / rect.width)  * 1.4;
    const sy = (100 / rect.height) * 1.4;

    this._cropPosition = {
      x: Math.max(0, Math.min(100, this._cropDragStart.posX - dx * sx)),
      y: Math.max(0, Math.min(100, this._cropDragStart.posY - dy * sy)),
    };
    this._updateCropPreview();
  };

  _cropUp = () => {
    this._cropDragStart = null;
    this.$cropViewport?.classList.remove('dragging');
    this.$cropViewport?.classList.add('has-dragged');
    document.removeEventListener('pointermove', this._cropMove);
    document.removeEventListener('pointerup',   this._cropUp);
  };

  // ── Dynamic background (Pexels, opt-in) ─────────────────────
  async setDynamic(trackTitle, trackAuthor = '') {
    if (this._hasCustom) return;
    if (!trackTitle) return;
    if (!Storage.getAutoBg()) return;

    const query    = this._buildQuery(trackTitle, trackAuthor);
    const cacheKey = CACHE_PREFIX + this._hashKey(query);
    const cached   = this._readCache(cacheKey);

    if (cached) { this._crossFadeTo(cached); return; }

    if (this._pendingFetch) this._pendingFetch.abort();
    this._pendingFetch = new AbortController();

    try {
      const url = new URL(BG_FETCH_PATH, window.location.origin);
      url.searchParams.set('q', query);

      const res  = await fetch(url.toString(), { method: 'GET', signal: this._pendingFetch.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.url) {
        this._writeCache(cacheKey, data.url);
        this._crossFadeTo(data.url);
      } else {
        this._showDefaultVideo();
      }
    } catch (err) {
      if (err.name !== 'AbortError') this._showDefaultVideo();
    } finally {
      this._pendingFetch = null;
    }
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

    // Reset bg-dynamic inline styles
    if (this.$bgDynamic) {
      this.$bgDynamic.style.objectFit      = '';
      this.$bgDynamic.style.objectPosition = '';
    }

    if (this._currentDynamicUrl) {
      this._crossFadeTo(this._currentDynamicUrl);
    } else {
      this._showDefaultVideo();
    }
  }

  _showDefaultVideo() {
    this.$bgDynamic?.classList.remove('visible');
    if (this.$bgVideo) this.$bgVideo.style.opacity = '1';
  }

  _crossFadeTo(imageUrl, hideVideo = false, position = { x: 50, y: 50 }, fit = 'cover') {
    if (!this.$bgDynamic) return;

    const img = this.$bgDynamic;
    const preload = new Image();

    preload.onload = () => {
      img.src = imageUrl;
      img.style.objectFit      = hideVideo ? fit : 'cover';
      img.style.objectPosition = hideVideo ? `${position.x}% ${position.y}%` : '50% 50%';
      img.classList.add('visible');
      this._currentDynamicUrl = imageUrl;

      if (this.$bgVideo) {
        this.$bgVideo.style.opacity = hideVideo ? '0' : '1';
      }
    };
    preload.onerror = () => this._showDefaultVideo();
    preload.src = imageUrl;
  }

  // ── Query builder ────────────────────────────────────────────
  _buildQuery(title, author) {
    const stopWords  = /\b(official|video|lyrics|audio|ft|feat|remix|mix|version|mv|hd|4k|vevo)\b/gi;
    const cleanTitle = title.replace(stopWords, '').replace(/[^\w\s]/g, ' ').trim();
    const parts      = [cleanTitle];

    if (author && author !== 'Unknown Artist' && author.length < 40) {
      const cleanAuthor = author.replace(/vevo|official|music|records|entertainment/gi, '').trim();
      if (cleanAuthor.length > 2) parts.push(cleanAuthor);
    }
    parts.push('nature landscape');
    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  }

  // ── Cache ────────────────────────────────────────────────────
  _hashKey(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  _readCache(key)        { try { return sessionStorage.getItem(key) || null; } catch { return null; } }
  _writeCache(key, val)  { try { sessionStorage.setItem(key, val); } catch { /* quota */ } }
}
