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
 *
 * Supported URL formats:
 *   open.spotify.com/track/<id>
 *   open.spotify.com/album/<id>
 *   open.spotify.com/playlist/<id>
 */

// Allowlist for valid Spotify ID characters
const SPOTIFY_ID_RE = /^[a-zA-Z0-9]{10,30}$/;

export class SpotifyProvider {
  constructor() {
    this._callbacks = {};
    this.embedController = null;
    this.playlistId = null;
    this.playlistType = null;
    this._loadTimeoutId = null;
  }

  on(event, fn)  { this._callbacks[event] = fn; }
  _emit(event, data) { this._callbacks[event]?.(data); }

  // ── URL validation ─────────────────────────────────────────
  static extractPlaylistId(url) {
    // Supports:
    //   open.spotify.com/playlist/PLAYLIST_ID
    //   open.spotify.com/album/ALBUM_ID
    //   open.spotify.com/track/TRACK_ID
    const match = url.match(/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)/);
    if (!match) return null;
    const type = match[1];
    const id   = match[2];
    // Validate the ID against allowlist
    if (!SPOTIFY_ID_RE.test(id)) return null;
    return { type, id };
  }

  static validateUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return SpotifyProvider.extractPlaylistId(url) !== null;
  }

  // ── Build embed URL ────────────────────────────────────────
  static buildEmbedUrl(type, id) {
    // Validate inputs before building the URL (no raw user data in src)
    if (!['playlist', 'album', 'track'].includes(type)) return null;
    if (!SPOTIFY_ID_RE.test(id)) return null;
    return `https://open.spotify.com/embed/${encodeURIComponent(type)}/${encodeURIComponent(id)}?utm_source=generator&theme=0`;
  }

  // ── Load playlist / render embed ───────────────────────────
  async loadPlaylist(url, iframeEl) {
    const parsed = SpotifyProvider.extractPlaylistId(url);
    if (!parsed) throw new Error('invalid_url');

    this.playlistId   = parsed.id;
    this.playlistType = parsed.type;

    this._emit('state', 'loading');

    const embedUrl = SpotifyProvider.buildEmbedUrl(parsed.type, parsed.id);
    if (!embedUrl) throw new Error('invalid_url');

    // Reset the iframe to force a clean load
    iframeEl.removeAttribute('src');
    iframeEl.height = '352';

    // Set up load/error handlers before setting src
    iframeEl.onload = () => {
      if (this._loadTimeoutId) {
        clearTimeout(this._loadTimeoutId);
        this._loadTimeoutId = null;
      }
      this._emit('state', 'loaded');
      this._emit('track', {
        title:  this._typeLabel(parsed.type),
        author: 'Use the Spotify player in settings',
      });
    };

    // onerror does not fire reliably for cross-origin iframes;
    // use a timeout fallback instead (30 s) — embed still works visually
    this._loadTimeoutId = setTimeout(() => {
      // If we haven't heard back, assume it loaded (embed is self-contained)
      this._emit('state', 'loaded');
      this._emit('track', {
        title:  this._typeLabel(parsed.type),
        author: 'Use the Spotify player in settings',
      });
    }, 30000);

    // Set src — this kicks off the iframe load
    iframeEl.src = embedUrl;

    // Try to attach the Spotify Iframe API for best-effort programmatic control
    this._tryLoadIframeApi(iframeEl);
  }

  _typeLabel(type) {
    return type === 'track' ? 'Spotify Track' : type === 'album' ? 'Spotify Album' : 'Spotify Playlist';
  }

  _tryLoadIframeApi(iframeEl) {
    // The Spotify Embed Iframe API allows limited control.
    // It may not be available in all browsers/contexts.
    if (window.SpotifyIframeApi) {
      this._initController(iframeEl);
      return;
    }

    if (!document.getElementById('spotify-api-script')) {
      const script = document.createElement('script');
      script.id    = 'spotify-api-script';
      script.src   = 'https://open.spotify.com/embed/iframe-api/v1';
      script.async = true;
      document.head.appendChild(script);
    }

    // Use a named callback to avoid clobbering a previous handler
    const prevReady = window.onSpotifyIframeApiReady;
    window.onSpotifyIframeApiReady = (IFrameAPI) => {
      window.SpotifyIframeApi = IFrameAPI;
      if (prevReady) prevReady(IFrameAPI);
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
    if (this._loadTimeoutId) {
      clearTimeout(this._loadTimeoutId);
      this._loadTimeoutId = null;
    }
    this.embedController = null;
    this.playlistId = null;
  }
}
