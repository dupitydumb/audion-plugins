'use strict';

/**
 * Fetching and validating plugin.json manifests.
 *
 * Validation separates hard errors (the plugin cannot be listed) from warnings
 * (the plugin is listed, but the author should fix something). Anything that
 * would drop a working plugin — an unusual version string, a category we have
 * not documented yet — is a warning, never an error.
 */

const { fetchText } = require('./github');

const REQUIRED_FIELDS = ['name', 'version', 'author', 'type', 'entry', 'permissions'];
const VALID_TYPES = ['js', 'wasm'];
const DEFAULT_CATEGORY = 'utility';

// Documented in README.md. `metadata` is accepted because a live plugin uses it.
const VALID_CATEGORIES = [
    'audio',
    'ui',
    'lyrics',
    'library',
    'utility',
    'appearance',
    'social',
    'sync',
    'metadata',
];

// Used for warnings only. The app is the authority on permissions, so a plugin
// asking for something new is flagged in the build log, not rejected.
const KNOWN_PERMISSIONS = new Set([
    'player:read',
    'player:control',
    'library:read',
    'library:write',
    'library:downloadTrack',
    'storage:local',
    'ui:inject',
    'network:fetch',
    'system:notify',
    'settings:write',
    'lyrics:read',
    'lyrics:write',
]);

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Returns { manifest } on success, { manifest: null, reason } when the repo has
 * no manifest, and throws on transport failures so the build can abort rather
 * than publish a registry with plugins quietly missing.
 */
async function fetchManifest(repo) {
    const path = `/${repo.full_name}/${repo.default_branch}/plugin.json`;
    const body = await fetchText('raw.githubusercontent.com', path);

    if (body === null) return { manifest: null, reason: 'no plugin.json' };

    try {
        return { manifest: JSON.parse(body) };
    } catch {
        return { manifest: null, reason: 'plugin.json is not valid JSON' };
    }
}

function isSafeRelativePath(value) {
    if (typeof value !== 'string' || value.trim() === '') return false;
    if (value.startsWith('/') || value.startsWith('\\')) return false;
    if (/^[a-zA-Z]+:/.test(value)) return false;
    if (value.split(/[\\/]/).includes('..')) return false;
    return true;
}

/**
 * @returns {{ ok: boolean, errors: string[], warnings: string[], manifest?: object }}
 */
function validateManifest(manifest) {
    const errors = [];
    const warnings = [];

    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        return { ok: false, errors: ['manifest is not an object'], warnings };
    }

    for (const field of REQUIRED_FIELDS) {
        if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
            errors.push(`missing required field: ${field}`);
        }
    }

    for (const field of ['name', 'version', 'author', 'type', 'entry']) {
        if (manifest[field] !== undefined && typeof manifest[field] !== 'string') {
            errors.push(`${field} must be a string`);
        }
    }

    if (typeof manifest.type === 'string' && !VALID_TYPES.includes(manifest.type)) {
        errors.push(`invalid type: ${manifest.type} (expected ${VALID_TYPES.join(' or ')})`);
    }

    if (manifest.permissions !== undefined) {
        if (!Array.isArray(manifest.permissions)) {
            errors.push('permissions must be an array');
        } else if (manifest.permissions.some((p) => typeof p !== 'string')) {
            errors.push('permissions must contain only strings');
        }
    }

    if (typeof manifest.entry === 'string' && !isSafeRelativePath(manifest.entry)) {
        errors.push(`entry must be a relative path inside the plugin: ${manifest.entry}`);
    }

    if (typeof manifest.icon === 'string' && !isSafeRelativePath(manifest.icon)) {
        errors.push(`icon must be a relative path inside the plugin: ${manifest.icon}`);
    }

    if (errors.length > 0) return { ok: false, errors, warnings };

    if (!SEMVER.test(manifest.version)) {
        warnings.push(`version "${manifest.version}" is not semver`);
    }

    if (manifest.category !== undefined && !VALID_CATEGORIES.includes(manifest.category)) {
        warnings.push(`unknown category "${manifest.category}", defaulting to "${DEFAULT_CATEGORY}"`);
    }

    const unknownPermissions = (manifest.permissions || []).filter((p) => !KNOWN_PERMISSIONS.has(p));
    if (unknownPermissions.length > 0) {
        warnings.push(`undocumented permissions: ${unknownPermissions.join(', ')}`);
    }

    if (manifest.type === 'js' && typeof manifest.entry === 'string' && !/\.(c|m)?js$/i.test(manifest.entry)) {
        warnings.push(`entry "${manifest.entry}" does not look like a JavaScript file`);
    }

    return { ok: true, errors, warnings };
}

module.exports = {
    REQUIRED_FIELDS,
    VALID_TYPES,
    VALID_CATEGORIES,
    DEFAULT_CATEGORY,
    KNOWN_PERMISSIONS,
    fetchManifest,
    validateManifest,
};
