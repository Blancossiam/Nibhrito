/**
 * youtube.js — Official YouTube IFrame Player API integration
 *
 * Uses the YouTube IFrame API (https://www.youtube.com/iframe_api).
 * The player iframe is placed off-screen (not display:none — that breaks the API).
 * Our custom UI drives all playback. This is fully ToS-compliant.
 */

export class YouTubeProvider {
  constructor(containerId) {
    this.containerId = containerId;
    this.player = null;
    this.playlistId = null;
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

  // ── Extract playlist ID from URL ───────────────────────────
  static extractPlaylistId(url) {
    // Supports:
    //   youtube.com/playlist?list=PLxxxxxxx
    //   youtube.com/watch?v=xxx&list=PLxxxxxxx
    //   youtu.be/xxx?list=PLxxxxxxx
    //   music.youtube.com/playlist?list=PLxxxxxxx
    const match = url.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  static validateUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|music\.youtube\.com)/.test(url) &&
      YouTubeProvider.extractPlaylistId(url) !== null;
  }

  // ── Initialise player ──────────────────────────────────────
  async loadPlaylist(url) {
    const playlistId = YouTubeProvider.extractPlaylistId(url);
    if (!playlistId) throw new Error('invalid_url');

    this.playlistId = playlistId;
    this._emit('state', 'loading');

    await this.loadAPI();
    await this._createPlayer(playlistId);
  }

  _createPlayer(playlistId) {
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

      this.player = new window.YT.Player('yt-player-inner', {
        width:  '320',
        height: '180',
        playerVars: {
          listType:       'playlist',
          list:           playlistId,
          autoplay:       0,
          controls:       0,
          disablekb:      1,
          modestbranding: 1,
          rel:            0,
          origin:         window.location.origin,
        },
        events: {
          onReady: (e) => {
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
      });
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
    this.player?.nextVideo();
    setTimeout(() => this._updateTrackInfo(), 800);
  }

  prev() {
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
