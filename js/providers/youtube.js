/**
 * youtube.js — Official YouTube IFrame Player API integration
 *
 * Uses the YouTube IFrame API (https://www.youtube.com/iframe_api).
 * The player iframe is placed off-screen (not display:none — that breaks the API).
 * Our custom UI drives all playback. This is fully ToS-compliant.
 *
 * Supported URL formats:
 *   youtube.com/playlist?list=PLxxxxxxx
 *   youtube.com/watch?v=xxx&list=PLxxxxxxx
 *   youtube.com/watch?v=xxx                 ← NEW: single-video mode
 *   youtu.be/xxx                            ← NEW: short link (single or with list)
 *   youtu.be/xxx?list=PLxxxxxxx             ← NEW: short link with playlist
 *   music.youtube.com/playlist?list=PLxxxxxx
 */

// Allowlist regex for playlist IDs and video IDs
const PLAYLIST_ID_RE = /^[a-zA-Z0-9_-]{2,64}$/;
const VIDEO_ID_RE    = /^[a-zA-Z0-9_-]{11}$/;

export class YouTubeProvider {
  constructor(containerId) {
    this.containerId = containerId;
    this.player = null;
    this.playlistId = null;
    this.videoId = null;
    this.mode = 'playlist'; // 'playlist' | 'single'
    this.ready = false;
    this.pendingPlay = false;
    this._callbacks = {};
    this._progressInterval = null;
    this._apiLoaded = false;
  }

  // ── Event emitter (lightweight) ───────────────────────────
  on(event, fn)  { this._callbacks[event] = fn; }
  _emit(event, data) { this._callbacks[event]?.(data); }

  // ── Load YouTube IFrame API ────────────────────────────────
  loadAPI() {
    if (window.YT && window.YT.Player) {
      this._apiLoaded = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const existing = document.getElementById('yt-api-script');
      if (!existing) {
        const script = document.createElement('script');
        script.id = 'yt-api-script';
        script.src = 'https://www.youtube.com/iframe_api';
        script.onerror = () => reject(new Error('Failed to load YouTube API'));
        document.head.appendChild(script);
      }
      // YouTube calls this global function when ready
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        this._apiLoaded = true;
        if (prev) prev();
        resolve();
      };
      // Already loaded race-condition safeguard
      setTimeout(() => {
        if (window.YT && window.YT.Player) { resolve(); }
      }, 3000);
    });
  }

  // ── URL parsing ────────────────────────────────────────────

  /**
   * Extract playlist ID from a YouTube URL.
   * Returns a validated playlist ID string, or null.
   */
  static extractPlaylistId(url) {
    const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    const id = match ? match[1] : null;
    return id && PLAYLIST_ID_RE.test(id) ? id : null;
  }

  /**
   * Extract video ID from a YouTube URL (all formats).
   * Returns a validated 11-char video ID, or null.
   */
  static extractVideoId(url) {
    let id = null;

    // youtu.be/<id>
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) id = shortMatch[1];

    // youtube.com/watch?v=<id> or youtube.com/shorts/<id>
    if (!id) {
      const longMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (longMatch) id = longMatch[1];
    }

    // youtube.com/shorts/<id>
    if (!id) {
      const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) id = shortsMatch[1];
    }

    return id && VIDEO_ID_RE.test(id) ? id : null;
  }

  /**
   * Validate a YouTube URL.
   * Accepts playlist URLs and single-video URLs.
   */
  static validateUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const isYTDomain = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)/.test(url);
    if (!isYTDomain) return false;
    return (
      YouTubeProvider.extractPlaylistId(url) !== null ||
      YouTubeProvider.extractVideoId(url)    !== null
    );
  }

  // ── Initialise player ──────────────────────────────────────
  async loadPlaylist(url) {
    const playlistId = YouTubeProvider.extractPlaylistId(url);
    const videoId    = YouTubeProvider.extractVideoId(url);

    if (!playlistId && !videoId) throw new Error('invalid_url');

    this._emit('state', 'loading');

    if (playlistId) {
      this.mode       = 'playlist';
      this.playlistId = playlistId;
      this.videoId    = null;
    } else {
      this.mode       = 'single';
      this.videoId    = videoId;
      this.playlistId = null;
    }

    // Inform the player UI about capabilities
    this._emit('capability', {
      hasPrev: this.mode === 'playlist',
      hasNext: this.mode === 'playlist',
    });

    await this.loadAPI();
    await this._createPlayer();
  }

  _createPlayer() {
    return new Promise((resolve, reject) => {
      // Destroy existing player
      if (this.player) {
        try { this.player.destroy(); } catch { /* */ }
        this.player = null;
        this.ready = false;
      }

      const container = document.getElementById(this.containerId);
      if (!container) { reject(new Error('Player container not found')); return; }

      // Ensure fresh div for the player
      container.innerHTML = '';
      const div = document.createElement('div');
      div.id = 'yt-player-inner';
      container.appendChild(div);

      const timeoutId = setTimeout(() => {
        reject(new Error('YouTube player timed out'));
      }, 20000);

      // Build playerVars depending on mode
      const playerVars = {
        autoplay:       0,
        controls:       0,
        disablekb:      1,
        modestbranding: 1,
        rel:            0,
        origin:         window.location.origin,
      };

      const ytConfig = {
        width:  '320',
        height: '180',
        events: {
          onReady: () => {
            clearTimeout(timeoutId);
            this.ready = true;
            this._applyVolume();
            this._emit('state', 'loaded');
            this._updateTrackInfo();
            resolve();
          },
          onStateChange: (e) => {
            this._handleStateChange(e.data);
          },
          onError: (e) => {
            clearTimeout(timeoutId);
            this._handleError(e.data);
          },
        },
      };

      if (this.mode === 'playlist') {
        playerVars.listType = 'playlist';
        playerVars.list     = this.playlistId;
        this.player = new window.YT.Player('yt-player-inner', {
          ...ytConfig,
          playerVars,
        });
      } else {
        // Single-video mode: pass videoId at the top level
        this.player = new window.YT.Player('yt-player-inner', {
          ...ytConfig,
          videoId: this.videoId,
          playerVars,
        });
      }
    });
  }

  _handleStateChange(state) {
    const S = window.YT.PlayerState;
    switch (state) {
      case S.PLAYING:
        this._emit('state', 'playing');
        this._updateTrackInfo();
        this._startProgress();
        break;
      case S.PAUSED:
        this._emit('state', 'paused');
        this._stopProgress();
        break;
      case S.BUFFERING:
        this._emit('state', 'buffering');
        break;
      case S.ENDED:
        this._emit('state', 'ended');
        this._stopProgress();
        break;
      case S.UNSTARTED:
        this._emit('state', 'loaded');
        break;
    }
  }

  _handleError(code) {
    // https://developers.google.com/youtube/iframe_api_reference#onError
    const messages = {
      2:   'invalid_url',
      5:   'playback_unavailable',
      100: 'not_found',
      101: 'embed_not_allowed',
      150: 'embed_not_allowed',
    };
    this._stopProgress();
    this._emit('error', messages[code] || 'playback_error');
  }

  _applyVolume() {
    if (this.player && this.ready) {
      const vol = this._volume !== undefined ? this._volume : 75;
      this.player.setVolume(vol * 100);
    }
  }

  // ── Progress tracking ──────────────────────────────────────
  _startProgress() {
    this._stopProgress();
    this._progressInterval = setInterval(() => {
      if (!this.player || !this.ready) return;
      try {
        const current  = this.player.getCurrentTime() || 0;
        const duration = this.player.getDuration()    || 0;
        this._emit('progress', { current, duration });
      } catch { /* */ }
    }, 500);
  }

  _stopProgress() {
    if (this._progressInterval) {
      clearInterval(this._progressInterval);
      this._progressInterval = null;
    }
  }

  _updateTrackInfo() {
    if (!this.player || !this.ready) return;
    try {
      const data = this.player.getVideoData();
      if (data) {
        this._emit('track', {
          title:  data.title  || 'Unknown Track',
          author: data.author || 'Unknown Artist',
        });
      }
    } catch { /* */ }
  }

  // ── Playback controls ──────────────────────────────────────
  play()  { this.player?.playVideo();   }
  pause() { this.player?.pauseVideo();  }

  next() {
    if (this.mode === 'single') return; // no-op for single-video
    this.player?.nextVideo();
    setTimeout(() => this._updateTrackInfo(), 800);
  }

  prev() {
    if (this.mode === 'single') return; // no-op for single-video
    this.player?.previousVideo();
    setTimeout(() => this._updateTrackInfo(), 800);
  }

  seekTo(seconds) {
    this.player?.seekTo(seconds, true);
  }

  setVolume(fraction) {
    // fraction: 0.0 – 1.0
    this._volume = fraction;
    if (this.player && this.ready) {
      this.player.setVolume(Math.round(fraction * 100));
    }
  }

  setMuted(muted) {{
    if (!this.player || !this.ready) return;
    muted ? this.player.mute() : this.player.unMute();
  }}

  getState() {
    if (!this.player || !this.ready) return 'unloaded';
    const S = window.YT?.PlayerState;
    if (!S) return 'unloaded';
    const s = this.player.getPlayerState();
    if (s === S.PLAYING)   return 'playing';
    if (s === S.PAUSED)    return 'paused';
    if (s === S.BUFFERING) return 'buffering';
    return 'loaded';
  }

  // ── Cleanup ────────────────────────────────────────────────
  destroy() {
    this._stopProgress();
    if (this.player) {
      try { this.player.destroy(); } catch { /* */ }
      this.player = null;
    }
    this.ready = false;
  }
}
