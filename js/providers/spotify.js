/**
 * spotify.js — Spotify Embed integration
 *
 * Uses the official Spotify Embed Iframe API:
 * https://developer.spotify.com/documentation/embeds/tutorials/using-the-iframe-api
 *
 * LIMITATIONS (documented here and shown to the user):
 * - Full programmatic control (play/pause/next/prev via JS) requires the
 *   Web Playback SDK which needs Spotify Premium + OAuth.
 * - The Spotify Embed widget works without login for 30-second previews
 *   of most tracks. Full playback requires the user to be logged into
 *   Spotify in their browser.
 * - We render the official Spotify embed inside the settings drawer,
 *   giving the user access to Spotify's own player UI.
 */

export class SpotifyProvider {
  constructor() {
    this._callbacks = {};
    this.embedController = null;
    this.playlistId = null;
    this.playlistType = null;
  }

  on(event, fn)  { this._callbacks[event] = fn; }
  _emit(event, data) { this._callbacks[event]?.(data); }

  // ── URL validation ─────────────────────────────────────────
  static extractPlaylistId(url) {
    // Supports:
    //   open.spotify.com/playlist/PLAYLIST_ID
    //   open.spotify.com/album/ALBUM_ID
    //   open.spotify.com/artist/ARTIST_ID
    const match = url.match(/open\.spotify\.com\/(playlist|album|artist|track)\/([a-zA-Z0-9]+)/);
    return match ? { type: match[1], id: match[2] } : null;
  }

  static validateUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return SpotifyProvider.extractPlaylistId(url) !== null;
  }

  // ── Build embed URL ────────────────────────────────────────
  static buildEmbedUrl(type, id) {
    return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
  }

  // ── Load playlist / render embed ───────────────────────────
  async loadPlaylist(url, iframeEl) {
    const parsed = SpotifyProvider.extractPlaylistId(url);
    if (!parsed) throw new Error('invalid_url');

    this.playlistId   = parsed.id;
    this.playlistType = parsed.type;

    this._emit('state', 'loading');

    const embedUrl = SpotifyProvider.buildEmbedUrl(parsed.type, parsed.id);

    // Set the iframe src — the Spotify embed is self-contained
    iframeEl.src = embedUrl;
    iframeEl.height = '352';

    iframeEl.onload = () => {
      this._emit('state', 'loaded');
      this._emit('track', {
        title:  'Spotify Playlist',
        author: 'Use the player below',
      });
    };

    iframeEl.onerror = () => {
      this._emit('error', 'playback_unavailable');
    };

    // Try to use the Spotify Iframe API for programmatic control
    this._tryLoadIframeApi(iframeEl);
  }

  _tryLoadIframeApi(iframeEl) {
    // The Spotify Embed Iframe API allows limited control
    if (window.SpotifyIframeApi) {
      this._initController(iframeEl);
      return;
    }

    const existing = document.getElementById('spotify-api-script');
    if (!existing) {
      const script = document.createElement('script');
      script.id  = 'spotify-api-script';
      script.src = 'https://open.spotify.com/embed/iframe-api/v1';
      document.head.appendChild(script);
    }

    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      window.SpotifyIframeApi = IFrameAPI;
      this._initController(iframeEl);
    };
  }

  _initController(iframeEl) {
    if (!window.SpotifyIframeApi) return;
    try {
      window.SpotifyIframeApi.createController(iframeEl, {}, (controller) => {
        this.embedController = controller;

        controller.addListener('playback_update', (e) => {
          if (e.data.isPaused) {
            this._emit('state', 'paused');
          } else {
            this._emit('state', 'playing');
          }
          this._emit('progress', {
            current:  (e.data.position || 0) / 1000,
            duration: (e.data.duration || 0) / 1000,
          });
        });

        controller.addListener('ready', () => {
          this._emit('state', 'loaded');
        });
      });
    } catch {
      // Iframe API not available in this context — embed still works visually
    }
  }

  // ── Playback controls (best-effort via Spotify Iframe API) ─
  play()  { this.embedController?.resume(); }
  pause() { this.embedController?.pause();  }
  next()  { this.embedController?.nextTrack?.(); }
  prev()  { this.embedController?.previousTrack?.(); }

  setVolume(fraction) {
    this.embedController?.setVolume?.(fraction);
  }

  // ── Cleanup ────────────────────────────────────────────────
  destroy() {
    this.embedController = null;
    this.playlistId = null;
  }
}
