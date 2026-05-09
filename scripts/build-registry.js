/**
 * Build Registry Script
 * 
 * Searches GitHub for repos with the 'audion-plugins' topic,
 * validates their plugin.json, and builds the registry.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const GITHUB_API = 'api.github.com';
const TOPIC = 'audion-plugins';
const OUTPUT_PATH = path.join(__dirname, '..', 'registry', 'main', 'registry.json');

// Required fields in plugin.json
const REQUIRED_FIELDS = ['name', 'version', 'author', 'type', 'entry', 'permissions'];
const VALID_TYPES = ['js', 'wasm'];
const VALID_CATEGORIES = ['audio', 'ui', 'lyrics', 'library', 'utility', 'appearance', 'social', 'sync'];

function httpsGet(options) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

// Helper for GitHub API requests with auth
async function githubFetch(path) {
    const headers = {
        'User-Agent': 'Audion-Registry-Builder',
        'Accept': 'application/vnd.github.v3+json'
    };
    
    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
    }
    
    const options = {
        hostname: GITHUB_API,
        path,
        headers
    };

    return await httpsGet(options);
}

async function searchRepos() {
    console.log(`Searching GitHub for repos with topic: ${TOPIC}`);
    const response = await githubFetch(`/search/repositories?q=topic:${TOPIC}&sort=stars&order=desc&per_page=100`);

    if (response.status !== 200) {
        throw new Error(`GitHub API error: ${response.status}`);
    }

    console.log(`Found ${response.data.total_count} repos`);
    return response.data.items || [];
}

async function fetchReleaseDownloads(repo) {
    console.log(`  📊 Fetching release downloads for ${repo.full_name}...`);
    const response = await githubFetch(`/repos/${repo.full_name}/releases`);
    
    if (response.status !== 200) return 0;
    
    let totalDownloads = 0;
    if (Array.isArray(response.data)) {
        for (const release of response.data) {
            if (release.assets && Array.isArray(release.assets)) {
                for (const asset of release.assets) {
                    totalDownloads += (asset.download_count || 0);
                }
            }
        }
    }
    return totalDownloads;
}

async function fetchPluginManifest(repo) {
    const options = {
        hostname: 'raw.githubusercontent.com',
        path: `/${repo.full_name}/${repo.default_branch}/plugin.json`,
        headers: {
            'User-Agent': 'Audion-Registry-Builder'
        }
    };

    const response = await httpsGet(options);

    if (response.status !== 200) {
        return null;
    }

    return response.data;
}

function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
        return { valid: false, error: 'Invalid JSON' };
    }

    // Check required fields
    for (const field of REQUIRED_FIELDS) {
        if (!manifest[field]) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
    }

    // Validate type
    if (!VALID_TYPES.includes(manifest.type)) {
        return { valid: false, error: `Invalid type: ${manifest.type}` };
    }

    // Validate permissions is array
    if (!Array.isArray(manifest.permissions)) {
        return { valid: false, error: 'Permissions must be an array' };
    }

    return { valid: true };
}

async function buildRegistry() {
    const repos = await searchRepos();
    const plugins = [];

    for (const repo of repos) {
        console.log(`\nChecking: ${repo.full_name}`);

        try {
            const manifest = await fetchPluginManifest(repo);

            if (!manifest) {
                console.log(`  ❌ No plugin.json found`);
                continue;
            }

            const validation = validateManifest(manifest);

            if (!validation.valid) {
                console.log(`  ❌ Invalid manifest: ${validation.error}`);
                continue;
            }

            console.log(`  ✅ Valid plugin: ${manifest.name}`);

            // Fetch live stats
            const downloads = await fetchReleaseDownloads(repo);

            // Build plugin entry
            plugins.push({
                manifest: {
                    name: manifest.name,
                    version: manifest.version,
                    author: manifest.author,
                    description: manifest.description || '',
                    repo: repo.html_url,
                    manifest_url: `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/plugin.json`,
                    type: manifest.type,
                    entry: manifest.entry,
                    permissions: manifest.permissions,
                    ui_slots: manifest.ui_slots,
                    icon: manifest.icon,
                    homepage: manifest.homepage || repo.html_url,
                    category: manifest.category || 'utility',
                    tags: manifest.tags,
                    license: manifest.license || repo.license?.spdx_id
                },
                curated: false,
                verified: false,
                repo: repo.html_url,
                manifest_url: `https://raw.githubusercontent.com/${repo.full_name}/${repo.default_branch}/plugin.json`,
                stars: repo.stargazers_count,
                downloads: downloads,
                lastUpdated: repo.updated_at
            });

        } catch (err) {
            console.log(`  ❌ Error: ${err.message}`);
        }
    }

    // Build registry object
    const registry = {
        version: '1.0.0',
        updated_at: new Date().toISOString(),
        plugins
    };

    // Ensure output directory exists
    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write registry
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(registry, null, 2));

    console.log(`\n✅ Registry built with ${plugins.length} plugins`);
    console.log(`   Total plugins processed: ${repos.length}`);
    console.log(`   Written to: ${OUTPUT_PATH}`);

    return registry;
}

// Run
buildRegistry().catch(err => {
    console.error('Failed to build registry:', err);
    process.exit(1);
});
