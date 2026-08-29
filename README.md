# 🌙 Moonlit River

A minimalist, immersive ambient website where visitors can listen to music over a peaceful looping night-time river scene.

---

## Features

- **Cinematic fullscreen background** — seamless looping video of a moonlit river with a fallback image
- **Premium glassmorphic music player** — compact, unobtrusive, positioned at the bottom of the screen
- **YouTube integration** — full programmatic control via the official YouTube IFrame API (play, pause, prev, next, seek, volume)
- **Spotify integration** — official Spotify Embed widget with best-effort control via the Spotify Embed Iframe API
- **Settings drawer** — smooth slide-in panel to switch providers and paste playlist URLs
- **Persistent preferences** — provider, URL, and volume saved to `localStorage`
- **Keyboard accessible** — Space (play/pause), Arrow keys (seek), M (mute), ESC (close settings)
- **Fully responsive** — desktop, tablet, and mobile layouts

---

## Getting Started

### Prerequisites

No build tool required. This is a pure HTML + CSS + JavaScript (ES Modules) application.

You need a **local web server** to serve the files (ES Modules require `http://` or `https://`, not `file://`).

### Option 1 — VS Code Live Server

1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → **Open with Live Server**

### Option 2 — Python

```bash
cd "C:\Users\User\OneDrive\Desktop\Gaan"
python -m http.server 8080
```
Then open `http://localhost:8080`.

### Option 3 — Node.js (npx serve)

```bash
cd "C:\Users\User\OneDrive\Desktop\Gaan"
npx serve .
```

---

## Adding Your Background Video

Place your looping night-time river video at:

```
assets/background.mp4
```

**Recommended video specs:**
- Format: MP4 (H.264)
- Resolution: 1920×1080 or higher
- Duration: 30–120 seconds (seamless loop)
- File size: Under 20MB for fast loading
- Audio: None needed (video is always muted)

If the video is missing or fails to load, the site falls back to `boat.png` as a static background.

---

## Using the Music Player

1. Open the site in your browser
2. Click the **⚙ Settings** icon (top right of the player) or **Add a playlist**
3. Choose a provider: **YouTube** or **Spotify**
4. Paste your playlist URL
5. Click **Load Playlist**

---

## Supported URL Formats

### YouTube
```
https://www.youtube.com/playlist?list=PLxxxxxx
https://www.youtube.com/watch?v=xxxxx&list=PLxxxxxx
https://music.youtube.com/playlist?list=PLxxxxxx
```

### Spotify
```
https://open.spotify.com/playlist/xxxxxxxx
https://open.spotify.com/album/xxxxxxxx
https://open.spotify.com/artist/xxxxxxxx
```

---

## Provider Limitations

### YouTube
- Full programmatic control: play, pause, prev, next, seek, volume ✅
- Track title and artist displayed in the player ✅
- Requires the video to allow embedding (most public playlists do)
- Music plays through the official YouTube embed (off-screen, ToS-compliant)

### Spotify
- The Spotify Embed widget is used — no API key or login required to load it
- **30-second previews** are available without a Spotify account
- **Full track playback** requires the user to be logged into Spotify in their browser
- Programmatic play/pause/next/prev is attempted via the Spotify Embed Iframe API where available
- For full custom UI control, Spotify's Web Playback SDK would be needed — this requires OAuth + Spotify Premium and is out of scope for this embed-based implementation

---

## Keyboard Shortcuts

| Key          | Action              |
|-------------|---------------------|
| `Space`     | Play / Pause        |
| `→`         | Seek forward 10s    |
| `←`         | Seek back 10s       |
| `M`         | Toggle mute         |
| `Escape`    | Close settings      |

---

## Project Structure

```
Gaan/
├── index.html              Main HTML
├── boat.png                Fallback poster image
├── assets/
│   └── background.mp4      Background video (you supply this)
├── css/
│   └── styles.css          All styles — design system, glassmorphism, animations
└── js/
    ├── app.js              Main app orchestrator
    ├── player.js           Player UI + controls
    ├── settings.js         Settings drawer logic
    ├── storage.js          localStorage persistence
    └── providers/
        ├── youtube.js      YouTube IFrame API integration
        └── spotify.js      Spotify Embed integration
```

---

## Browser Support

| Browser     | Support |
|-------------|---------|
| Chrome 90+  | ✅ Full  |
| Firefox 90+ | ✅ Full  |
| Safari 15+  | ✅ Full  |
| Edge 90+    | ✅ Full  |

> ES Modules are used — IE is not supported.

---

## Privacy

No personal data is collected or sent to any external service. All preferences are stored locally in your browser's `localStorage`. The only external requests are:
- Google Fonts (Inter typeface)
- YouTube IFrame API (when using YouTube)
- Spotify Embed (when using Spotify)
