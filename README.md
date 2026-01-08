# Audion Plugin Development Guide

Welcome to the Audion Plugin Development Guide! This comprehensive guide will walk you through creating plugins for Audion, a modern music player with a powerful plugin system that supports both JavaScript (JS) and WebAssembly (WASM) plugins.

## Table of Contents

1. [Introduction](#introduction)
2. [Plugin Architecture Overview](#plugin-architecture-overview)
3. [Getting Started](#getting-started)
4. [Plugin Manifest (plugin.json)](#plugin-manifest-pluginjson)
5. [Plugin Structure](#plugin-structure)
6. [Available Permissions](#available-permissions)
7. [Plugin API Reference](#plugin-api-reference)
8. [Lifecycle Hooks](#lifecycle-hooks)
9. [Storage API](#storage-api)
10. [UI Injection](#ui-injection)
11. [Examples](#examples)
12. [Testing and Debugging](#testing-and-debugging)
13. [Best Practices](#best-practices)
14. [Distribution](#distribution)

---

## Introduction

Audion's plugin system allows developers to extend the functionality of the music player without modifying the core application. Plugins can:

- Monitor and control playback
- Access and modify the music library
- Inject custom UI elements
- Store persistent data
- Show system notifications
- Make network requests

### Plugin Types

Audion supports two types of plugins:

- **JavaScript (JS)**: Standard JavaScript files that run in the browser context
- **WebAssembly (WASM)**: Compiled WASM modules for performance-critical tasks

This guide primarily focuses on JavaScript plugins, which are easier to develop and debug.

---

## Plugin Architecture Overview

### How Plugins Work

1. **Discovery**: Audion scans the plugins directory for `plugin.json` manifest files
2. **Loading**: The plugin runtime loads the plugin code based on the manifest
3. **Initialization**: The plugin's `init()` function is called with an API object
4. **Enabling**: The plugin's `start()` function is called when enabled
5. **Runtime**: The plugin can interact with Audion via the provided API
6. **Disabling**: The plugin's `stop()` function is called when disabled
7. **Cleanup**: The plugin's `destroy()` function is called when unloaded

### Directory Structure

```
plugin-examples/
└── your-plugin-name/
    ├── plugin.json       # Plugin manifest (required)
    ├── index.js          # Main plugin code (entry point)
    ├── icon.png          # Optional plugin icon
    └── README.md         # Optional documentation
```

> **Important**: The folder name should be lowercase with dashes (e.g., `play-counter`, `now-playing-notifier`). Audion automatically sanitizes plugin names to this format.

---

## Getting Started

### Prerequisites

- Basic knowledge of JavaScript
- A text editor or IDE
- Audion installed and running

### Creating Your First Plugin

1. **Create a plugin folder** in the `plugin-examples` directory:
   ```
   plugin-examples/hello-world/
   ```

2. **Create `plugin.json`**:
   ```json
   {
     "name": "Hello World",
     "version": "1.0.0",
     "author": "Your Name",
     "description": "My first Audion plugin",
     "type": "js",
     "entry": "index.js",
     "permissions": ["player:read"],
     "category": "utility",
     "tags": ["demo"],
     "license": "MIT"
   }
   ```

3. **Create `index.js`**:
   ```javascript
   (function () {
     'use strict';

     const HelloWorld = {
       name: 'Hello World',

       init(api) {
         console.log('[HelloWorld] Plugin initialized!');
         console.log('[HelloWorld] API:', api);
         this.api = api;
       },

       start() {
         console.log('[HelloWorld] Plugin started');
         const track = this.api.player.getCurrentTrack();
         if (track) {
           console.log('[HelloWorld] Current track:', track.title);
         }
       },

       stop() {
         console.log('[HelloWorld] Plugin stopped');
       },

       destroy() {
         console.log('[HelloWorld] Plugin destroyed');
       }
     };

     // Register plugin globally
     window.HelloWorld = HelloWorld;
     window.AudionPlugin = HelloWorld;
   })();
   ```

4. **Install and enable** the plugin in Audion's plugin manager

---

## Plugin Manifest (plugin.json)

The `plugin.json` file is the entry point for your plugin. It defines metadata, permissions, and configuration.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Display name of your plugin |
| `version` | `string` | Semantic version (e.g., "1.0.0") |
| `author` | `string` | Your name or organization |
| `type` | `"js"` or `"wasm"` | Plugin type |
| `entry` | `string` | Main file (e.g., "index.js") |
| `permissions` | `string[]` | Array of required permissions |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `description` | `string` | Short description of your plugin |
| `repo` | `string` | GitHub repository URL |
| `manifest_url` | `string` | URL to hosted manifest |
| `icon` | `string` | Path to icon file |
| `homepage` | `string` | Plugin website URL |
| `category` | `string` | Category: `audio`, `ui`, `lyrics`, `library`, or `utility` |
| `tags` | `string[]` | Searchable tags |
| `min_version` | `string` | Minimum Audion version required |
| `license` | `string` | License identifier (e.g., "MIT") |
| `ui_slots` | `string[]` | UI injection points (experimental) |

### Example Manifest

```json
{
  "name": "Play Counter",
  "version": "1.0.0",
  "author": "Audion Team",
  "description": "Tracks how many times each song has been played",
  "type": "js",
  "entry": "index.js",
  "permissions": [
    "player:read",
    "storage:local",
    "ui:inject"
  ],
  "category": "library",
  "tags": ["stats", "play-count", "analytics"],
  "license": "MIT"
}
```

---

## Plugin Structure

### JavaScript Plugin Pattern

Use an Immediately Invoked Function Expression (IIFE) to avoid polluting the global namespace:

```javascript
(function () {
  'use strict';

  const YourPlugin = {
    name: 'Your Plugin Name',
    
    // State variables
    someState: null,

    // Initialization
    init(api) {
      this.api = api;
      // Setup code here
    },

    // Start hook
    start() {
      // Enable functionality
    },

    // Stop hook
    stop() {
      // Disable functionality
    },

    // Cleanup
    destroy() {
      // Clean up resources
    }
  };

  // Register plugin globally
  window.YourPlugin = YourPlugin;
  window.AudionPlugin = YourPlugin;
})();
```

### Important Notes

- **Global Registration**: You must register your plugin on `window` using both a unique name and `window.AudionPlugin`
- **Strict Mode**: Always use `'use strict'` for better error handling
- **API Storage**: Store the `api` object passed to `init()` for later use
- **Resource Cleanup**: Always clean up intervals, event listeners, and UI elements in `destroy()`

---

## Available Permissions

Permissions control what your plugin can access. Request only the permissions you need.

| Permission | Description | API Methods |
|------------|-------------|-------------|
| `player:read` | Read playback state and current track | `getCurrentTrack()`, `isPlaying()`, `getCurrentTime()`, `getDuration()` |
| `player:control` | Control playback | `play()`, `pause()`, `togglePlay()`, `next()`, `prev()`, `seek()` |
| `library:read` | Read music library | `getTracks()`, `getPlaylists()` (planned) |
| `library:write` | Modify library | Not yet implemented |
| `storage:local` | Store plugin data locally | `storage.get()`, `storage.set()` |
| `ui:inject` | Inject custom UI elements | Direct DOM manipulation |
| `network:fetch` | Make network requests | Standard `fetch()` API |
| `system:notify` | Show system notifications | Browser `Notification` API |
| `lyrics:read` | Read lyrics data | Planned |
| `lyrics:write` | Modify lyrics | Planned |

### Permission Examples

```json
{
  "permissions": ["player:read", "storage:local"]
}
```

---

## Plugin API Reference

The API object passed to `init()` contains methods based on your requested permissions.

### Player API

#### With `player:read` Permission

```javascript
// Get current track object
const track = api.player.getCurrentTrack();
// Returns: { id, title, artist, album, duration, path, ... } or null

// Check if playing
const playing = api.player.isPlaying();
// Returns: boolean

// Get current playback time (seconds)
const time = api.player.getCurrentTime();
// Returns: number

// Get track duration (seconds)
const duration = api.player.getDuration();
// Returns: number
```

#### With `player:control` Permission

```javascript
// Play
api.player.play();

// Pause
api.player.pause();

// Next track
api.player.next();

// Previous track
api.player.prev();

// Seek to time (in seconds)
api.player.seek(120); // Seek to 2:00
```

### Storage API

#### With `storage:local` Permission

```javascript
// Store data (any JSON-serializable value)
await api.storage.set('myKey', { count: 42, items: [] });

// Retrieve data
const data = await api.storage.get('myKey');
// Returns: { count: 42, items: [] } or null if not found

// Storage is namespaced per plugin automatically
```

> **Note**: Storage uses localStorage internally with keys prefixed by `audion_plugin_{pluginName}_{key}`. Each plugin has isolated storage.

### Track Object Structure

```typescript
{
  id: number;           // Unique track ID
  title: string;        // Song title
  artist: string;       // Artist name
  album: string;        // Album name
  duration: number;     // Duration in seconds
  path: string;         // File path
  track_number: number; // Track number
  disc_number: number;  // Disc number
  year: number;         // Release year
  genre: string;        // Genre
  added_at: string;     // ISO timestamp
  // ... additional metadata
}
```

---

## Lifecycle Hooks

Plugins have four main lifecycle hooks:

### 1. `init(api)`

Called once when the plugin is loaded.

```javascript
init(api) {
  console.log('Plugin initialized');
  this.api = api;
  
  // Load persistent data
  this.loadData();
  
  // Inject styles
  this.injectStyles();
  
  // Create UI
  this.createUI();
  
  // Set up timers (if needed)
  this.checkInterval = setInterval(() => this.checkTrack(), 1000);
}
```

**Use for**:
- Storing the API reference
- Loading saved data
- Injecting CSS
- Creating UI elements
- Setting up timers

### 2. `start()`

Called when the plugin is enabled (or on first load if auto-enabled).

```javascript
start() {
  console.log('Plugin started');
  
  // Show UI
  if (this.uiElement) {
    this.uiElement.style.display = 'block';
  }
  
  // Request permissions
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
```

**Use for**:
- Showing UI elements
- Requesting browser permissions
- Starting functionality

### 3. `stop()`

Called when the plugin is disabled.

```javascript
stop() {
  console.log('Plugin stopped');
  
  // Hide UI
  if (this.uiElement) {
    this.uiElement.style.display = 'none';
  }
}
```

**Use for**:
- Hiding UI elements
- Pausing functionality (without full cleanup)

### 4. `destroy()`

Called when the plugin is completely unloaded.

```javascript
destroy() {
  console.log('Plugin destroyed');
  
  // Clear intervals
  if (this.checkInterval) {
    clearInterval(this.checkInterval);
  }
  
  // Remove UI elements
  if (this.uiElement) {
    this.uiElement.remove();
  }
  
  // Remove styles
  const styleEl = document.getElementById('my-plugin-styles');
  if (styleEl) {
    styleEl.remove();
  }
  
  // Save data
  this.saveData();
}
```

**Use for**:
- Clearing timers and intervals
- Removing UI elements
- Removing injected styles
- Saving data
- Complete cleanup

---

## Storage API

The storage API provides persistent, namespaced storage for your plugin.

### Basic Usage

```javascript
// Saving data
async saveMyData() {
  await this.api.storage.set('playCounts', JSON.stringify(this.playCounts));
  await this.api.storage.set('settings', { enabled: true, threshold: 30 });
}

// Loading data
async loadMyData() {
  const counts = await this.api.storage.get('playCounts');
  if (counts) {
    this.playCounts = JSON.parse(counts);
  }
  
  const settings = await this.api.storage.get('settings');
  if (settings) {
    this.threshold = settings.threshold;
  }
}
```

### Data Types

The storage API accepts any JSON-serializable value:
- Strings
- Numbers
- Booleans
- Arrays
- Objects
- `null`

```javascript
// Examples
await api.storage.set('count', 42);
await api.storage.set('items', ['a', 'b', 'c']);
await api.storage.set('config', { theme: 'dark', fontSize: 14 });
```

### Error Handling

```javascript
try {
  await api.storage.set('myKey', myData);
} catch (err) {
  console.error('[MyPlugin] Failed to save data:', err);
}
```

---

## UI Injection

With the `ui:inject` permission, you can inject custom UI elements using standard DOM manipulation.

### Injecting Styles

```javascript
injectStyles() {
  // Check if styles already exist
  if (document.getElementById('my-plugin-styles')) {
    return;
  }
  
  const style = document.createElement('style');
  style.id = 'my-plugin-styles';
  style.textContent = `
    #my-widget {
      position: fixed;
      bottom: 120px;
      right: 20px;
      background: #181818;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      z-index: 9999;
    }
  `;
  document.head.appendChild(style);
}
```

### Creating UI Elements

```javascript
createUI() {
  // Check if widget already exists
  if (document.getElementById('my-widget')) {
    return;
  }
  
  const widget = document.createElement('div');
  widget.id = 'my-widget';
  widget.innerHTML = `
    <h3>My Plugin</h3>
    <div id="my-content">Content here</div>
  `;
  
  document.body.appendChild(widget);
  this.uiElement = widget;
}
```

### Integrating with Player UI

You can inject buttons into the player bar:

```javascript
createPlayerBarButton() {
  const volumeControls = document.querySelector('.volume-controls');
  if (!volumeControls) {
    return; // Retry later if not found
  }
  
  const button = document.createElement('button');
  button.className = 'icon-btn';
  button.title = 'My Plugin';
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
    </svg>
  `;
  button.addEventListener('click', () => this.toggleWidget());
  
  volumeControls.insertBefore(button, volumeControls.firstChild);
}
```

### Cleanup

Always remove UI elements in `destroy()`:

```javascript
destroy() {
  // Remove widget
  if (this.uiElement) {
    this.uiElement.remove();
  }
  
  // Remove styles
  const styleEl = document.getElementById('my-plugin-styles');
  if (styleEl) {
    styleEl.remove();
  }
  
  // Remove buttons
  if (this.playerBarButton) {
    this.playerBarButton.remove();
  }
}
```

---

## Examples

### Example 1: Simple Track Monitor

Logs when tracks change:

```javascript
(function () {
  'use strict';

  const TrackMonitor = {
    name: 'Track Monitor',
    lastTrackId: null,

    init(api) {
      this.api = api;
      this.checkInterval = setInterval(() => this.checkTrack(), 1000);
    },

    checkTrack() {
      const track = this.api.player.getCurrentTrack();
      
      if (track && track.id !== this.lastTrackId) {
        console.log('[TrackMonitor] Now playing:', track.title, 'by', track.artist);
        this.lastTrackId = track.id;
      }
    },

    start() {
      console.log('[TrackMonitor] Started monitoring tracks');
    },

    stop() {
      console.log('[TrackMonitor] Stopped monitoring tracks');
    },

    destroy() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
    }
  };

  window.TrackMonitor = TrackMonitor;
  window.AudionPlugin = TrackMonitor;
})();
```

**plugin.json**:
```json
{
  "name": "Track Monitor",
  "version": "1.0.0",
  "author": "You",
  "description": "Logs track changes",
  "type": "js",
  "entry": "index.js",
  "permissions": ["player:read"],
  "category": "utility",
  "license": "MIT"
}
```

### Example 2: Play Counter

Tracks how many times each song has been played:

```javascript
(function () {
  'use strict';

  const PlayCounter = {
    name: 'Play Counter',
    playCounts: {},
    lastTrackId: null,
    playStartTime: null,
    MIN_PLAY_TIME: 30000, // 30 seconds

    init(api) {
      this.api = api;
      this.loadCounts();
      this.checkInterval = setInterval(() => this.checkTrack(), 1000);
    },

    async loadCounts() {
      const saved = await this.api.storage.get('playCounts');
      if (saved) {
        this.playCounts = saved;
      }
    },

    async saveCounts() {
      await this.api.storage.set('playCounts', this.playCounts);
    },

    checkTrack() {
      const track = this.api.player.getCurrentTrack();
      const isPlaying = this.api.player.isPlaying();

      if (!track) return;

      // New track started
      if (track.id !== this.lastTrackId) {
        // Count previous track if played long enough
        if (this.lastTrackId && this.playStartTime) {
          const playDuration = Date.now() - this.playStartTime;
          if (playDuration >= this.MIN_PLAY_TIME) {
            this.incrementCount(this.lastTrackId);
          }
        }

        this.lastTrackId = track.id;
        this.playStartTime = isPlaying ? Date.now() : null;
      } else if (isPlaying && !this.playStartTime) {
        this.playStartTime = Date.now();
      } else if (!isPlaying && this.playStartTime) {
        this.playStartTime = null;
      }
    },

    incrementCount(trackId) {
      this.playCounts[trackId] = (this.playCounts[trackId] || 0) + 1;
      console.log(`[PlayCounter] Track ${trackId} played ${this.playCounts[trackId]} times`);
      this.saveCounts();
    },

    getCount(trackId) {
      return this.playCounts[trackId] || 0;
    },

    start() {
      console.log('[PlayCounter] Started');
    },

    stop() {
      console.log('[PlayCounter] Stopped');
    },

    destroy() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
      this.saveCounts();
    }
  };

  window.PlayCounter = PlayCounter;
  window.AudionPlugin = PlayCounter;
})();
```

**plugin.json**:
```json
{
  "name": "Play Counter",
  "version": "1.0.0",
  "author": "Audion Team",
  "description": "Tracks play counts for songs",
  "type": "js",
  "entry": "index.js",
  "permissions": ["player:read", "storage:local"],
  "category": "library",
  "tags": ["stats", "analytics"],
  "license": "MIT"
}
```

### Example 3: System Notifications

Shows notifications when tracks change:

```javascript
(function () {
  'use strict';

  const NowPlayingNotifier = {
    name: 'Now Playing Notifier',
    lastTrackId: null,

    init(api) {
      this.api = api;
      this.checkInterval = setInterval(() => this.checkTrack(), 1000);
    },

    checkTrack() {
      const track = this.api.player.getCurrentTrack();

      if (track && track.id !== this.lastTrackId) {
        this.lastTrackId = track.id;
        this.showNotification(track);
      }
    },

    showNotification(track) {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Now Playing', {
          body: `${track.title} - ${track.artist}`,
          icon: 'path/to/icon.png', // Optional
          silent: true
        });
      }
    },

    start() {
      // Request notification permission
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    },

    stop() {
      console.log('[NowPlayingNotifier] Stopped');
    },

    destroy() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
    }
  };

  window.NowPlayingNotifier = NowPlayingNotifier;
  window.AudionPlugin = NowPlayingNotifier;
})();
```

**plugin.json**:
```json
{
  "name": "Now Playing Notifier",
  "version": "1.0.0",
  "author": "Audion Team",
  "description": "Shows notifications when tracks change",
  "type": "js",
  "entry": "index.js",
  "permissions": ["player:read", "system:notify"],
  "category": "utility",
  "tags": ["notification"],
  "license": "MIT"
}
```

---

## Testing and Debugging

### Console Logging

Always prefix your console logs with your plugin name:

```javascript
console.log('[MyPlugin] Initialized');
console.error('[MyPlugin] Error:', err);
```

### Browser DevTools

1. Open DevTools (F12)
2. Check the **Console** tab for plugin logs
3. Use **Elements** tab to inspect injected UI
4. Use **Network** tab to debug fetch requests

### Common Issues

#### Plugin Not Loading

- Check that `plugin.json` is valid JSON
- Verify the `entry` field points to the correct file
- Check the browser console for errors
- Ensure folder name matches the sanitized plugin name

#### API Methods Not Available

- Verify you've requested the correct permissions in `plugin.json`
- Check that you're storing the `api` object in `init()`
- Ensure you're calling methods as `this.api.player.method()`

#### Storage Not Working

- Ensure you have `storage:local` permission
- Remember to `await` storage calls
- Check for JSON serialization errors
- Use try/catch blocks for error handling

#### UI Not Appearing

- Check that styles are injected
- Verify z-index is high enough (e.g., 9999)
- Ensure elements are appended to `document.body`
- Check for CSS conflicts

### Debug Mode

Enable verbose logging:

```javascript
const DEBUG = true;

function debug(...args) {
  if (DEBUG) {
    console.log('[MyPlugin]', ...args);
  }
}

// Usage
debug('Track changed:', track);
```

---

## Best Practices

### 1. Namespace Everything

Use unique IDs and class names to avoid conflicts:

```javascript
// Good
#my-plugin-widget
.my-plugin-button

// Bad
#widget
.button
```

### 2. Clean Up Resources

Always clean up in `destroy()`:

```javascript
destroy() {
  // Clear intervals
  if (this.interval) clearInterval(this.interval);
  
  // Remove event listeners
  if (this.button) {
    this.button.removeEventListener('click', this.handleClick);
  }
  
  // Remove DOM elements
  if (this.widget) this.widget.remove();
  
  // Remove styles
  document.getElementById('my-plugin-styles')?.remove();
}
```

### 3. Handle Missing APIs Gracefully

```javascript
checkTrack() {
  if (!this.api?.player?.getCurrentTrack) {
    console.warn('[MyPlugin] Player API not available');
    return;
  }
  
  const track = this.api.player.getCurrentTrack();
  // ...
}
```

### 4. Use Async/Await for Storage

```javascript
// Good
async loadData() {
  try {
    const data = await this.api.storage.get('myData');
    if (data) {
      this.myData = data;
    }
  } catch (err) {
    console.error('[MyPlugin] Load error:', err);
  }
}

// Bad
loadData() {
  this.api.storage.get('myData').then(data => {
    this.myData = data;
  });
}
```

### 5. Request Minimal Permissions

Only request permissions you actually need:

```json
// Good - only what you need
{
  "permissions": ["player:read"]
}

// Bad - requesting everything
{
  "permissions": [
    "player:read",
    "player:control",
    "library:read",
    "library:write",
    "storage:local",
    "ui:inject"
  ]
}
```

### 6. Provide User Feedback

Show loading states and error messages:

```javascript
async loadData() {
  this.showStatus('Loading...');
  
  try {
    const data = await this.api.storage.get('data');
    this.showStatus('Loaded successfully');
  } catch (err) {
    this.showStatus('Error loading data');
  }
}
```

### 7. Use Debouncing for Frequent Updates

```javascript
updateUI() {
  if (this.updateTimeout) {
    clearTimeout(this.updateTimeout);
  }
  
  this.updateTimeout = setTimeout(() => {
    this.doActualUpdate();
  }, 100);
}
```

### 8. Validate Data

```javascript
incrementCount(trackId) {
  if (!trackId || typeof trackId !== 'number') {
    console.error('[MyPlugin] Invalid track ID:', trackId);
    return;
  }
  
  this.playCounts[trackId] = (this.playCounts[trackId] || 0) + 1;
}
```

### 9. Document Your Code

```javascript
/**
 * Checks if the current track has changed and updates the play count
 * if the previous track was played for at least MIN_PLAY_TIME
 */
checkTrack() {
  // Implementation
}
```

### 10. Version Your Plugin

Use semantic versioning and update when you make changes:

- `1.0.0` → Initial release
- `1.0.1` → Bug fixes
- `1.1.0` → New features (backward compatible)
- `2.0.0` → Breaking changes

---

## Distribution

### Publishing Your Plugin

1. **Create a GitHub repository** for your plugin
2. **Add a README.md** with:
   - Description
   - Features
   - Installation instructions
   - Screenshots
   - License
3. **Tag releases** using Git tags (e.g., `v1.0.0`)
4. **Host plugin.json** with a `manifest_url` field pointing to the raw GitHub URL

### Example plugin.json with Updates

```json
{
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "Description here",
  "repo": "https://github.com/yourusername/my-plugin",
  "manifest_url": "https://raw.githubusercontent.com/yourusername/my-plugin/main/plugin.json",
  "type": "js",
  "entry": "index.js",
  "permissions": ["player:read"],
  "homepage": "https://github.com/yourusername/my-plugin",
  "category": "utility",
  "license": "MIT"
}
```

### Installation Instructions for Users

Users can install your plugin by:

1. Downloading your plugin folder
2. Placing it in Audion's `plugin-examples` directory
3. Enabling it in the plugin manager

Or (future feature):
- Installing via URL directly in Audion's plugin manager

---

## Advanced Topics

### Monitoring Multiple Events

```javascript
init(api) {
  this.api = api;
  
  // Poll for changes
  this.checkInterval = setInterval(() => {
    this.checkTrackChange();
    this.checkPlaybackState();
    this.checkTime();
  }, 500);
}

checkTrackChange() {
  const track = this.api.player.getCurrentTrack();
  if (track?.id !== this.lastTrackId) {
    this.onTrackChanged(track);
    this.lastTrackId = track?.id;
  }
}

checkPlaybackState() {
  const playing = this.api.player.isPlaying();
  if (playing !== this.lastPlayingState) {
    this.onPlaybackStateChanged(playing);
    this.lastPlayingState = playing;
  }
}
```

### Creating Complex UI

```javascript
createWidget() {
  const widget = document.createElement('div');
  widget.id = 'my-complex-widget';
  widget.innerHTML = `
    <div class="widget-header">
      <h3>My Plugin</h3>
      <button id="minimize-btn">−</button>
    </div>
    <div class="widget-content">
      <div id="track-info"></div>
      <div id="statistics"></div>
      <div id="controls">
        <button id="btn-prev">Previous</button>
        <button id="btn-play">Play</button>
        <button id="btn-next">Next</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(widget);
  
  // Add event listeners
  document.getElementById('btn-play').addEventListener('click', () => {
    this.api.player.togglePlay();
  });
  
  document.getElementById('minimize-btn').addEventListener('click', () => {
    this.toggleMinimize();
  });
}
```

### Network Requests (with `network:fetch`)

```javascript
async fetchLyrics(artist, title) {
  try {
    const response = await fetch(`https://api.lyrics.com/search?artist=${artist}&title=${title}`);
    const data = await response.json();
    return data.lyrics;
  } catch (err) {
    console.error('[MyPlugin] Fetch error:', err);
    return null;
  }
}
```

---

## FAQ

### Q: Can I use external libraries?

**A**: Yes, but you need to bundle them with your plugin or load them via CDN. Example:

```javascript
// Load external library
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/library@1.0.0/dist/library.min.js';
document.head.appendChild(script);
```

### Q: How do I access the queue?

**A**: The queue API is currently limited. You can access basic queue info, but full queue manipulation is not yet available.

### Q: Can plugins communicate with each other?

**A**: Not directly via the API, but you can use custom events or shared storage (localStorage) for inter-plugin communication.

### Q: What's the difference between `stop()` and `destroy()`?

**A**: `stop()` temporarily disables the plugin (user can re-enable), while `destroy()` completely unloads it (requires reload).

### Q: Can I use TypeScript?

**A**: Yes! Compile your TypeScript to JavaScript and use the compiled JS as your entry point.

### Q: How do I debug WASM plugins?

**A**: WASM debugging is more complex. Use browser DevTools and consider generating source maps if compiling from Rust/C++.

---

## Conclusion

You now have everything you need to create powerful plugins for Audion! Start with a simple plugin, experiment with the APIs, and gradually add more features.

### Next Steps

1. Create your first plugin using the examples above
2. Test it thoroughly in Audion
3. Share it with the community
4. Contribute improvements to this guide

### Resources

- [Example Plugins](../plugin-examples/)
- [Plugin Schema](../src/lib/plugins/schema.ts)
- [Plugin Runtime](../src/lib/plugins/runtime.ts)
- [GitHub Issues](https://github.com/yourusername/audion/issues)

### Community

- Found a bug? [Report it](https://github.com/yourusername/audion/issues)
- Have a plugin idea? [Discuss it](https://github.com/yourusername/audion/discussions)
- Created a plugin? [Share it](https://github.com/yourusername/audion-plugins)

Happy coding! 🎵
