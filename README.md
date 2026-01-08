# Audion Plugin Registry Automation

This folder contains scripts to automatically build the plugin registry by searching GitHub for repos with the `audion-plugins` topic.

## How It Works

1. **GitHub Actions** runs daily (or on manual trigger)
2. **Searches GitHub** for all repos with the `audion-plugins` topic
3. **Fetches `plugin.json`** from each repo's root
4. **Validates** the manifest has required fields
5. **Builds `registry.json`** with all valid plugins
6. **Commits** the updated registry

## Setup

### 1. Create Registry Repository

Create a new repo (e.g., `audion-plugins`) and copy the contents of this folder to it.

### 2. For Plugin Authors

To have your plugin included in the registry:

1. Add the `audion-plugins` topic to your GitHub repo
2. Add a valid `plugin.json` in your repo root
3. The registry will automatically discover your plugin!

### 3. Required plugin.json Fields

```json
{
  "name": "My Plugin",
  "version": "1.0.0",
  "author": "Your Name",
  "type": "js",           // or "wasm"
  "entry": "index.js",    // or "plugin.wasm"
  "permissions": ["player:read"]
}
```

### 4. Optional Fields

```json
{
  "description": "What your plugin does",
  "category": "utility",  // audio, ui, lyrics, library, utility
  "tags": ["tag1", "tag2"],
  "icon": "icon.png",
  "homepage": "https://yoursite.com",
  "license": "MIT"
}
```

## Manual Run

```bash
npm install
npm run build
```

## File Structure

```
registry-automation/
├── .github/
│   └── workflows/
│       └── update-registry.yml    # GitHub Actions workflow
├── scripts/
│   └── build-registry.js          # Registry builder script
├── registry/
│   └── main/
│       └── registry.json          # Output registry (auto-generated)
├── package.json
└── README.md
```
