# 🌙 Drift with the Sound

A minimalist, immersive ambient website where visitors can listen to music over a peaceful looping night-time river scene.

---

## Features

- **Cinematic fullscreen background** — seamless looping video of a moonlit river with a fallback image
- **Dynamic backgrounds** — automatically fetches a landscape photo matching the current song via Pexels (with graceful fallback)
- **Custom background upload** — upload any image from your device as the background; it stays in your browser, never uploaded anywhere
- **Premium glassmorphic music player** — compact, unobtrusive, positioned at the bottom of the screen
- **YouTube integration** — full programmatic control via the official YouTube IFrame API (play, pause, prev, next, seek, volume). Supports both playlists **and single video links**
- **Spotify integration** — official Spotify Embed widget inside the settings drawer; use Spotify's own player controls
- **Settings drawer** — smooth slide-in panel to switch providers, paste URLs, and upload a background image
- **Persistent preferences** — provider, URL, and volume saved to `localStorage`
- **Keyboard accessible** — Space (play/pause), Arrow keys (seek), M (mute), ESC (close settings)
- **Fully responsive** — desktop, tablet, and mobile layouts
- **Security hardened** — CSP headers, no API keys exposed client-side, URL sanitisation

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

## Environment Variables

The dynamic background feature calls a Vercel Serverless Function (`/api/bg`) which fetches images from [Pexels](https://www.pexels.com/api/). The Pexels API key is held **server-side only** and never exposed to the browser.

### Setup (Vercel)

1. Sign up for a free Pexels API key at https://www.pexels.com/api/
2. In the Vercel dashboard for this project, go to **Settings → Environment Variables**
3. Add: `PEXELS_API_KEY` = `<your key>`

### Setup (local development)

```bash
cp .env.example .env.local
# Edit .env.local and paste your key
```

> If no key is set, the app falls back gracefully to the default moonlit river video background. No errors occur.

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
2. Click the **⚙ Settings** icon (top right of the player) or **Add a playlist or video**
3. Choose a provider: **YouTube** or **Spotify**
4. Paste your URL
5. Click **Load**

### Custom Background

In the settings drawer, scroll to **Custom Background** and click **Upload image** to pick any image from your device. It appears immediately as the background. Click **Use default** to remove it. The image is never sent anywhere over the network.

---

## Supported URL Formats

### YouTube

```
https://www.youtube.com/playlist?list=PLxxxxxx        ← playlist
https://www.youtube.com/watch?v=xxxxx&list=PLxxxxxx   ← video + playlist
https://www.youtube.com/watch?v=xxxxx                 ← single video ✨NEW
https://youtu.be/xxxxx                                ← short link ✨NEW
https://youtu.be/xxxxx?list=PLxxxxxx                  ← short link + playlist ✨NEW
https://music.youtube.com/playlist?list=PLxxxxxx      ← YouTube Music
```

### Spotify

```
https://open.spotify.com/playlist/xxxxxxxx    ← playlist
https://open.spotify.com/album/xxxxxxxx       ← album
https://open.spotify.com/track/xxxxxxxx       ← single track ✨NEW
```

---

## Provider Limitations

### YouTube
- Full programmatic control: play, pause, prev, next, seek, volume ✅
- Single video links play one track; prev/next are disabled ✅
- Track title and artist displayed in the player ✅
- Requires the video to allow embedding (most public videos/playlists do)
- Music plays through the official YouTube embed (off-screen, ToS-compliant)

### Spotify
- The Spotify Embed widget is used — **no API key or login required to load it**
- **30-second previews** are available without a Spotify account
- **Full track playback** requires the user to be logged into Spotify in their browser
- The Spotify player appears inside the Settings drawer; keep it open to interact with it
- Programmatic play/pause/next/prev is attempted via the Spotify Embed Iframe API where available

---

## Background System

Backgrounds are layered (bottom → top):

| Layer | Element | Description |
|-------|---------|-------------|
| 0 | `#bg-video` | Default moonlit river loop (always present) |
| 1 | `#bg-dynamic` | Per-track image from Pexels (cross-fades in/out) |
| 2 | `#bg-overlay` | Cinematic gradient overlay |
| 10+ | `#app` | Player UI |

**Priority:** custom upload > dynamic Pexels image > default video

The cross-fade transition is 1.2 s. Each image is cached in `sessionStorage` to avoid re-fetching on repeat plays.

---

## Security

- **No API keys in client JS** — the Pexels key is stored as a Vercel env var and proxied through `/api/bg`
- **Content Security Policy** — set via `vercel.json` headers, only allowing necessary domains
- **`X-Frame-Options: DENY`** — prevents the site from being embedded in a foreign frame
- **All user input sanitised** — URL validation uses `new URL()` + domain allowlist, IDs validated against regex before use in iframe src
- **File uploads stay local** — `URL.createObjectURL()` is used; no network request is ever made with the image data
- **Served over HTTPS** — enforced by Vercel; `Strict-Transport-Security` header included

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
├── vercel.json             Vercel routing + security headers
├── .env.example            Environment variable documentation
├── assets/
│   ├── background.mp4      Background video (you supply this)
│   └── bg.jpg              Fallback poster image
├── api/
│   └── bg.js               Pexels background image proxy (serverless function)
├── css/
│   └── styles.css          All styles — design system, glassmorphism, animations
└── js/
    ├── app.js              Main app orchestrator
    ├── player.js           Player UI + controls
    ├── settings.js         Settings drawer logic (URL input + bg upload)
    ├── storage.js          localStorage persistence
    ├── bgManager.js        Dynamic background + upload management
    └── providers/
        ├── youtube.js      YouTube IFrame API (playlist + single video)
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

- No personal data is collected or sent to any external service
- All preferences are stored locally in your browser's `localStorage`
- Custom background images are processed entirely in your browser; they are **never uploaded** to any server
- Background images are fetched from Pexels via a server-side proxy; your browser only receives the image URL
- External requests made:
  - Google Fonts (Inter typeface)
  - YouTube IFrame API (when using YouTube)
  - Spotify Embed (when using Spotify)
  - `/api/bg` → Pexels API (server-side, keyed — when using YouTube)
