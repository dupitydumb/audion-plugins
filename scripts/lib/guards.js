'use strict';

/**
 * Publish safety guards.
 *
 * The registry is a published artifact; a degraded build is worse than a stale
 * one. These checks refuse to publish when the plugin set shrank in a way that
 * looks like an API problem rather than real removals.
 */

const MAX_LOSS_RATIO = 0.2;

/**
 * @param {object}   previous  the registry currently on disk
 * @param {object[]} next      the plugins the build produced
 * @param {Map}      curated   overlays.loadCurated()
 * @param {object}   blocked   overlays.loadBlocked()
 * @param {object}   overlays  the overlays module (for matching helpers)
 * @returns {{ ok: boolean, problems: string[], missing: string[] }}
 */
function checkGuards(previous, next, curated, blocked, overlays) {
    const empty = { ok: true, problems: [], missing: [] };

    if (!previous || !Array.isArray(previous.plugins) || previous.plugins.length === 0) {
        return empty;
    }

    const previousRepos = previous.plugins.map((p) => p.repo);
    const nextRepos = new Set(next.map((p) => p.repo));

    // Repos that left because a maintainer blocked or hid them are expected and
    // must not count against the loss budget.
    const expected = new Set(
        previous.plugins
            .filter((plugin) => {
                const curation = curated.get(overlays.normaliseRepo(plugin.repo));
                return (
                    curation?.hidden === true ||
                    overlays.isBlocked(blocked, {
                        repoUrl: plugin.repo,
                        author: plugin.manifest?.author,
                        name: plugin.manifest?.name,
                    })
                );
            })
            .map((plugin) => plugin.repo)
    );

    const missing = previousRepos.filter((repo) => !nextRepos.has(repo) && !expected.has(repo));
    const problems = [];

    if (next.length === 0) {
        problems.push('build produced zero plugins');
    } else if (missing.length / previousRepos.length > MAX_LOSS_RATIO) {
        problems.push(
            `${missing.length}/${previousRepos.length} plugins disappeared (limit ${Math.round(
                MAX_LOSS_RATIO * 100
            )}%)`
        );
    }

    return { ok: problems.length === 0, problems, missing };
}

module.exports = { MAX_LOSS_RATIO, checkGuards };
