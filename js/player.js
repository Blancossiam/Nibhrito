/**
 * player.js — Music player UI logic
 *
 * Manages the glass player UI:
 *   - Track info display
 *   - Progress bar (seek)
 *   - Play/Pause, Prev, Next controls
 *   - Volume / Mute
 *   - Shuffle / Repeat toggles
 *   - Empty state
 *   - Provider state management
 */

import { Storage } from './storage.js';

export class Player {
  constructor() {
    // DOM refs
    this.$container      = document.getElementById('player-container');
    this.$playerShell    = document.getElementById('player-shell');
    this.$trackTitle     = document.getElementById('track-title');
    this.$trackSubtitle  = document.getElementById('track-subtitle');
    this.$trackIcon      = document.getElementById('track-icon');
    this.$btnPlay        = document.getElementById('btn-play-pause');
    this.$btnPrev        = document.getElementById('btn-prev');
    this.$btnNext        = document.getElementById('btn-next');
    this.$btnShuffle     = document.getElementById('btn-shuffle');
    this.$btnRepeat      = document.getElementById('btn-repeat');
    this.$btnMute        = document.getElementById('btn-mute');
    this.$volumeSlider   = document.getElementById('volume-slider');
    this.$progressWrap   = document.getElementById('progress-bar-wrap');
    this.$progressFill   = document.getElementById('progress-bar-fill');
    this.$progressThumb  = document.getElementById('progress-bar-thumb');
    this.$timeElapsed    = document.getElementById('time-elapsed');
    this.$timeDuration   = document.getElementById('time-duration');
    this.$emptyState     = document.getElementById('empty-state');
    this.$controls       = document.getElementById('controls-row');
    this.$progressSection= document.getElementById('progress-section');
    this.$trackInfo      = document.getElementById('track-info');

    // State
    this.currentState  = 'empty';    // empty | loading | loaded | playing | paused | buffering | error
    this.isMuted       = false;
    this.isShuffle     = false;
    this.isRepeat      = false;
    this.volume        = Storage.getVolume();
    this.duration      = 0;
    this.currentTime   = 0;
    this.provider      = null;  // set by app.js
    this.providerType  = null;  // 'youtube' | 'spotify'

    this._seekDragging = false;

    this._init();
  }

  _init() {
    // Apply saved volume
    this.$volumeSlider.value = this.volume;
    this._applyVolumeUI(this.volume);

    // Play / Pause
    this.$btnPlay.addEventListener('click', () => this._togglePlay());

    // Prev / Next
    this.$btnPrev.addEventListener('click', () => this.provider?.prev());
    this.$btnNext.addEventListener('click', () => this.provider?.next());

    // Shuffle
    this.$btnShuffle.addEventListener('click', () => {
      this.isShuffle = !this.isShuffle;
      this.$btnShuffle.classList.toggle('active', this.isShuffle);
      this.$btnShuffle.setAttribute('aria-pressed', this.isShuffle);
    });

    // Repeat
    this.$btnRepeat.addEventListener('click', () => {
      this.isRepeat = !this.isRepeat;
      this.$btnRepeat.classList.toggle('active', this.isRepeat);
      this.$btnRepeat.setAttribute('aria-pressed', this.isRepeat);
    });

    // Mute
    this.$btnMute.addEventListener('click', () => this._toggleMute());

    // Volume slider
    this.$volumeSlider.addEventListener('input', (e) => {
      const vol = parseFloat(e.target.value);
      this.volume  = vol;
      this.isMuted = false;
      this._applyVolumeUI(vol);
      this.provider?.setVolume(vol);
      Storage.setVolume(vol);
    });

    // Progress — click to seek
    this.$progressWrap.addEventListener('click', (e) => {
      if (!this.provider || this.duration === 0) return;
      const rect = this.$progressWrap.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekTo = fraction * this.duration;
      this.provider.seekTo(seekTo);
      this._setProgress(seekTo, this.duration);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't intercept when typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (this.currentState !== 'empty' && this.currentState !== 'loading') {
            this._togglePlay();
          }
          break;
        case 'ArrowRight':
          if (this.provider && this.duration > 0) {
            this.provider.seekTo(Math.min(this.currentTime + 10, this.duration));
          }
          break;
        case 'ArrowLeft':
          if (this.provider && this.duration > 0) {
            this.provider.seekTo(Math.max(this.currentTime - 10, 0));
          }
          break;
        case 'KeyM':
          this._toggleMute();
          break;
      }
    });

    // Initial UI state
    this.setState('empty');
  }

  // ── State management ────────────────────────────────────────
  setState(state, data = {}) {
    this.currentState = state;

    const isActive = ['loaded', 'playing', 'paused', 'buffering'].includes(state);
    const isEmpty  = state === 'empty';
    const isLoading= state === 'loading';

    // Toggle sections
    this.$emptyState.hidden      = !isEmpty;
    this.$controls.hidden        = isEmpty || isLoading;
    this.$progressSection.hidden = isEmpty || isLoading;

    // Track info row — always show, varies content
    if (isEmpty) {
      this.$trackTitle.textContent    = 'Moonlit River';
      this.$trackSubtitle.textContent = 'Add a playlist to begin';
      this._setTrackIcon('music');
    } else if (isLoading) {
      this.$trackTitle.textContent    = 'Loading playlist';
      this.$trackSubtitle.innerHTML   = '<span class="loading-dots"><span></span><span></span><span></span></span>';
      this._setTrackIcon('loading');
    }

    // Play button icon
    if (state === 'playing') {
      this.$btnPlay.innerHTML = this._icon('pause');
      this.$btnPlay.setAttribute('aria-label', 'Pause');
    } else if (state === 'buffering') {
      this.$btnPlay.innerHTML = '<span class="spinner"></span>';
      this.$btnPlay.setAttribute('aria-label', 'Buffering');
    } else {
      this.$btnPlay.innerHTML = this._icon('play');
      this.$btnPlay.setAttribute('aria-label', 'Play');
    }

    // Spotify — hide progress/controls (embed handles it)
    if (this.providerType === 'spotify' && isActive) {
      this.$progressSection.hidden = true;
      this.$btnPrev.hidden         = true;
      this.$btnNext.hidden         = true;
      this.$btnPlay.hidden         = true;
      this.$controls.hidden        = false; // show mute/volume/shuffle
    } else if (isActive) {
      this.$btnPrev.hidden = false;
      this.$btnNext.hidden = false;
      this.$btnPlay.hidden = false;
    }
  }

  // ── Track info ──────────────────────────────────────────────
  setTrackInfo({ title, author }) {
    this.$trackTitle.textContent    = title  || 'Unknown Track';
    this.$trackSubtitle.textContent = author || '';
    this._setTrackIcon('note');
  }

  _setTrackIcon(type) {
    if (type === 'loading') {
      this.$trackIcon.innerHTML = '<span class="spinner"></span>';
    } else if (type === 'note') {
      this.$trackIcon.innerHTML = this._icon('music-note');
    } else {
      this.$trackIcon.innerHTML = this._icon('music');
    }
  }

  // ── Progress ────────────────────────────────────────────────
  setProgress({ current, duration }) {
    this.currentTime = current;
    this.duration    = duration;
    this._setProgress(current, duration);
  }

  _setProgress(current, duration) {
    const pct = duration > 0 ? (current / duration) * 100 : 0;
    this.$progressFill.style.width = `${pct}%`;
    this.$progressThumb.style.left = `${pct}%`;
    this.$timeElapsed.textContent  = this._formatTime(current);
    this.$timeDuration.textContent = this._formatTime(duration);
  }

  _formatTime(secs) {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Volume ──────────────────────────────────────────────────
  _toggleMute() {
    this.isMuted = !this.isMuted;
    this.provider?.setMuted?.(this.isMuted);
    if (this.isMuted) {
      this.$btnMute.innerHTML = this._icon('mute');
      this.$btnMute.setAttribute('aria-label', 'Unmute');
      this.$btnMute.classList.add('active');
    } else {
      this._applyVolumeUI(this.volume);
      this.$btnMute.classList.remove('active');
    }
  }

  _applyVolumeUI(vol) {
    const icon = vol === 0 ? 'mute' : vol < 0.45 ? 'vol-low' : 'vol-high';
    this.$btnMute.innerHTML = this._icon(icon);
    this.$btnMute.setAttribute('aria-label', vol === 0 ? 'Unmute' : 'Mute');
  }

  // ── Playback toggle ─────────────────────────────────────────
  _togglePlay() {
    if (!this.provider) return;
    const state = this.currentState;
    if (state === 'playing') {
      this.provider.pause();
    } else if (state === 'paused' || state === 'loaded') {
      this.provider.play();
    }
  }

  // ── Set active provider ─────────────────────────────────────
  setProvider(provider, type) {
    this.provider     = provider;
    this.providerType = type;
    this._setProgress(0, 0);
    // Reset capability when provider changes
    this.setCapability({ hasPrev: true, hasNext: true });
  }

  // ── Set provider capabilities ────────────────────────────────
  // Called by YouTube provider when in single-video mode to disable nav.
  setCapability({ hasPrev = true, hasNext = true } = {}) {
    if (this.$btnPrev) {
      this.$btnPrev.disabled = !hasPrev;
      this.$btnPrev.style.opacity = hasPrev ? '' : '0.35';
      this.$btnPrev.title = hasPrev ? 'Previous' : 'Previous (playlist only)';
    }
    if (this.$btnNext) {
      this.$btnNext.disabled = !hasNext;
      this.$btnNext.style.opacity = hasNext ? '' : '0.35';
      this.$btnNext.title = hasNext ? 'Next' : 'Next (playlist only)';
    }
  }

  // ── SVG Icons (minimal line icons) ─────────────────────────
  _icon(name) {
    const icons = {
      'play': `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`,
      'pause': `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
      'prev': `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>`,
      'next': `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 18l8.5-6L6 6v12zm2-8.14 5.25 3.64L8 17.14V9.86zM16 6h2v12h-2z"/></svg>`,
      'shuffle': `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>`,
      'repeat': `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>`,
      'mute': `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/></svg>`,
      'vol-low': `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/></svg>`,
      'vol-high': `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
      'music': `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
      'music-note': `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
      'settings': `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`,
    };
    return icons[name] || '';
  }
}
