import { getContextSafe } from './utils.js';

const REPOSITORY_URL = 'https://github.com/AnNastyLoneGirl/NastyTavern-UI';
const REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/AnNastyLoneGirl/NastyTavern-UI/main/manifest.json';
const REMOTE_CHANGELOG_URL = 'https://raw.githubusercontent.com/AnNastyLoneGirl/NastyTavern-UI/main/CHANGELOG.md';
const CHANGELOG_URL = `${REPOSITORY_URL}/blob/main/CHANGELOG.md`;
const LOCAL_MANIFEST_URL = new URL('../manifest.json', import.meta.url).href;
const LOCAL_CHANGELOG_URL = new URL('../CHANGELOG.md', import.meta.url).href;
const CACHE_KEY = 'nt:update-check:v5';
const CACHE_TTL = 15 * 60 * 1000;
const REQUEST_TIMEOUT = 7000;
const UPDATE_TIMEOUT = 60 * 1000;

const cleanVersion = value => String(value ?? '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+-]/, 1)[0];

const versionParts = value => cleanVersion(value)
    .split('.')
    .map(part => Number.parseInt(part, 10))
    .map(part => Number.isFinite(part) ? part : 0)
    .slice(0, 3);

export const compareVersions = (left, right) => {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < 3; index += 1) {
        const diff = (a[index] || 0) - (b[index] || 0);
        if (diff !== 0) return diff > 0 ? 1 : -1;
    }
    return 0;
};

const cleanRevision = value => {
    const revision = Number.parseInt(value, 10);
    return Number.isFinite(revision) && revision > 0 ? revision : 0;
};

const compareReleaseIdentity = (remoteVersion, remoteRevision, localVersion, localRevision) => {
    const versionComparison = compareVersions(remoteVersion, localVersion);
    if (versionComparison !== 0) return versionComparison;
    const revisionDiff = cleanRevision(remoteRevision) - cleanRevision(localRevision);
    return revisionDiff === 0 ? 0 : (revisionDiff > 0 ? 1 : -1);
};

const stripInlineMarkdown = value => String(value ?? '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();

const normalizeTrackedText = value => String(value ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .trim();

const canonicalizeValue = value => {
    if (Array.isArray(value)) return value.map(canonicalizeValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
        Object.keys(value)
            .sort((left, right) => left.localeCompare(right))
            .map(key => [key, canonicalizeValue(value[key])]),
    );
};

const canonicalManifest = manifest => JSON.stringify(canonicalizeValue(manifest || {}));

const fingerprint = value => {
    const text = String(value ?? '');
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const fetchWithTimeout = async (url, options = {}, timeout = REQUEST_TIMEOUT) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
};

const fetchManifestSource = async (url, { remote = false } = {}) => {
    const response = await fetchWithTimeout(url, { cache: 'no-store' });
    if (!response.ok) {
        const scope = remote ? 'Update' : 'Local';
        throw new Error(`${scope} manifest request failed (${response.status})`);
    }
    const raw = await response.text();
    return {
        raw,
        manifest: JSON.parse(raw),
    };
};

const fetchText = async (url, { remote = false } = {}) => {
    const response = await fetchWithTimeout(url, remote ? { cache: 'no-store' } : {});
    if (!response.ok) throw new Error(`Update changelog request failed (${response.status})`);
    return await response.text();
};

const parseChangelog = (markdown, predicate) => {
    const entries = [];
    let version = '';
    let category = '';
    let include = false;

    for (const rawLine of String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')) {
        const versionMatch = rawLine.match(/^##\s+v?(\d+(?:\.\d+){1,2}(?:[-+][^\s]+)?)\s*$/i);
        if (versionMatch) {
            version = cleanVersion(versionMatch[1]);
            category = '';
            include = Boolean(predicate?.(version));
            continue;
        }

        const categoryMatch = rawLine.match(/^###\s+(.+?)\s*$/);
        if (categoryMatch) {
            category = stripInlineMarkdown(categoryMatch[1]);
            continue;
        }

        if (!include) continue;
        const bulletMatch = rawLine.match(/^\s*-\s+(.+?)\s*$/);
        if (!bulletMatch) continue;
        const text = stripInlineMarkdown(bulletMatch[1]);
        if (!text) continue;
        entries.push({ version, category, text });
    }

    return entries;
};

const readCache = (localVersion, localRevision, localSignature) => {
    try {
        const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
        if (!parsed || parsed.localVersion !== localVersion || cleanRevision(parsed.localRevision) !== cleanRevision(localRevision)) return null;
        if (parsed.localSignature !== localSignature) return null;
        if (!Number.isFinite(parsed.checkedAt) || Date.now() - parsed.checkedAt > CACHE_TTL) return null;
        return parsed.data || null;
    } catch (_) {
        return null;
    }
};

const writeCache = (localVersion, localRevision, localSignature, data) => {
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({
            localVersion,
            localRevision: cleanRevision(localRevision),
            localSignature,
            checkedAt: Date.now(),
            data,
        }));
    } catch (_) {}
};

const getLocalManifestSource = async () => fetchManifestSource(LOCAL_MANIFEST_URL);

const getInstalledExtensionName = () => {
    try {
        const rootUrl = new URL('../', import.meta.url);
        const segments = rootUrl.pathname.split('/').filter(Boolean);
        return decodeURIComponent(segments.at(-1) || 'NastyTavern-UI');
    } catch (_) {
        return 'NastyTavern-UI';
    }
};

const getNativeHeaders = () => {
    const context = getContextSafe();
    try {
        return context?.getRequestHeaders?.() || { 'Content-Type': 'application/json' };
    } catch (_) {
        return { 'Content-Type': 'application/json' };
    }
};

const requestExtensionEndpoint = async (endpoint, extensionName, global, timeout = REQUEST_TIMEOUT) => {
    const response = await fetchWithTimeout(`/api/extensions/${endpoint}`, {
        method: 'POST',
        headers: getNativeHeaders(),
        body: JSON.stringify({ extensionName, global }),
    }, timeout);

    let data = null;
    let text = '';
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try { data = await response.json(); }
        catch (_) {}
    } else {
        try { text = await response.text(); }
        catch (_) {}
    }

    return { response, data, text };
};

const getNativeRepoStatus = async extensionName => {
    try {
        const local = await requestExtensionEndpoint('version', extensionName, false);
        if (local.response.ok && local.data) return { ...local.data, extensionGlobal: false };
        if (local.response.status !== 404) return null;

        const global = await requestExtensionEndpoint('version', extensionName, true);
        if (global.response.ok && global.data) return { ...global.data, extensionGlobal: true };
    } catch (error) {
    }
    return null;
};

const makeBaseResult = manifest => ({
    state: 'unavailable',
    localVersion: cleanVersion(manifest?.version),
    latestVersion: cleanVersion(manifest?.version),
    localRevision: cleanRevision(manifest?.revision),
    latestRevision: cleanRevision(manifest?.revision),
    maintenanceUpdate: false,
    changes: [],
    repositoryUrl: REPOSITORY_URL,
    changelogUrl: CHANGELOG_URL,
    extensionName: getInstalledExtensionName(),
    extensionGlobal: null,
    nativeManaged: false,
});

const getLocalReleaseNotes = async version => {
    try {
        const localChangelog = await fetchText(LOCAL_CHANGELOG_URL);
        return parseChangelog(localChangelog, entryVersion => compareVersions(entryVersion, version) === 0);
    } catch (_) {
        return [];
    }
};

export async function getNastyTavernUpdateInfo({ force = false } = {}) {
    let localManifestSource;
    try {
        localManifestSource = await getLocalManifestSource();
    } catch (error) {
        return null;
    }

    const localManifest = localManifestSource.manifest;
    const base = makeBaseResult(localManifest);
    if (!base.localVersion) return null;

    let localChangelog = '';
    try {
        localChangelog = await fetchText(LOCAL_CHANGELOG_URL);
    } catch (error) {
    }

    // The updater treats manifest.json and CHANGELOG.md as release identity files.
    // A content fingerprint keeps same-version hotfixes detectable without being
    // fooled by JSON formatting, line endings or trailing whitespace.
    const localManifestCanonical = canonicalManifest(localManifest);
    const localChangelogNormalized = normalizeTrackedText(localChangelog);
    const localSignature = fingerprint(`${localManifestCanonical}\n---CHANGELOG---\n${localChangelogNormalized}`);

    if (!force) {
        const cached = readCache(base.localVersion, base.localRevision, localSignature);
        if (cached) return cached;
    }

    const [manifestResult, changelogResult, nativeResult] = await Promise.allSettled([
        fetchManifestSource(REMOTE_MANIFEST_URL, { remote: true }),
        fetchText(REMOTE_CHANGELOG_URL, { remote: true }),
        getNativeRepoStatus(base.extensionName),
    ]);

    const remoteManifestSource = manifestResult.status === 'fulfilled' ? manifestResult.value : null;
    const remoteManifest = remoteManifestSource?.manifest || null;
    const remoteChangelog = changelogResult.status === 'fulfilled' ? changelogResult.value : '';
    const nativeStatus = nativeResult.status === 'fulfilled' ? nativeResult.value : null;
    const remoteVersion = cleanVersion(remoteManifest?.version);
    const remoteRevision = cleanRevision(remoteManifest?.revision);
    const latestVersion = remoteVersion || base.localVersion;
    const latestRevision = remoteVersion ? remoteRevision : base.localRevision;
    const releaseComparison = remoteVersion
        ? compareReleaseIdentity(remoteVersion, remoteRevision, base.localVersion, base.localRevision)
        : 0;

    const manifestChanged = Boolean(
        remoteManifest
        && canonicalManifest(remoteManifest) !== localManifestCanonical
    );
    const changelogChanged = Boolean(
        changelogResult.status === 'fulfilled'
        && normalizeTrackedText(remoteChangelog) !== localChangelogNormalized
    );
    const contentChanged = manifestChanged || changelogChanged;
    const sameReleaseIdentity = Boolean(remoteVersion && releaseComparison === 0);
    const maintenanceUpdate = Boolean(
        remoteVersion
        && compareVersions(remoteVersion, base.localVersion) === 0
        && (
            remoteRevision > base.localRevision
            || (sameReleaseIdentity && contentChanged)
        )
    );

    let state = 'unavailable';
    if (remoteVersion) {
        // Newer version/revision is an update. If both sides advertise the same
        // release identity, any meaningful manifest or changelog content change
        // is also an update. A locally newer test revision never gets downgraded
        // merely because its files intentionally differ from the public release.
        state = releaseComparison > 0 || (sameReleaseIdentity && contentChanged)
            ? 'available'
            : 'current';
    } else if (nativeStatus && nativeStatus.isUpToDate === true) {
        state = 'current';
    }

    let changes = remoteChangelog
        ? parseChangelog(remoteChangelog, version => compareVersions(version, latestVersion) === 0)
        : [];
    if (!changes.length && state !== 'available' && compareVersions(latestVersion, base.localVersion) === 0) {
        changes = await getLocalReleaseNotes(base.localVersion);
    }

    const result = {
        ...base,
        state,
        latestVersion,
        latestRevision,
        maintenanceUpdate,
        manifestChanged,
        changelogChanged,
        contentChanged,
        changes,
        extensionGlobal: nativeStatus?.extensionGlobal ?? null,
        nativeManaged: Boolean(nativeStatus),
    };

    writeCache(base.localVersion, base.localRevision, localSignature, result);
    return result;
}

export async function updateNastyTavernExtension(info = {}) {
    // Re-check immediately before mutating the checkout so a stale Home card can
    // never launch a Git pull after the installed version has already caught up.
    const freshInfo = await getNastyTavernUpdateInfo({ force: true });
    if (!freshInfo || freshInfo.state !== 'available') {
        return { skipped: true, upToDate: true };
    }
    if (!freshInfo.nativeManaged) {
        throw new Error('This NastyTavern installation is not managed by SillyTavern Git updates.');
    }

    const extensionName = String(freshInfo.extensionName || info.extensionName || getInstalledExtensionName()).trim();
    if (!extensionName) throw new Error('Could not determine the NastyTavern extension folder.');

    const preferredGlobal = typeof freshInfo.extensionGlobal === 'boolean'
        ? freshInfo.extensionGlobal
        : (typeof info.extensionGlobal === 'boolean' ? info.extensionGlobal : false);
    const attempts = typeof freshInfo.extensionGlobal === 'boolean'
        ? [preferredGlobal]
        : (typeof info.extensionGlobal === 'boolean' ? [preferredGlobal] : [false, true]);

    let lastError = null;
    for (const global of attempts) {
        try {
            const result = await requestExtensionEndpoint('update', extensionName, global, UPDATE_TIMEOUT);
            if (result.response.ok) return { ...(result.data || {}), extensionGlobal: global };

            const message = result.text || result.data?.error || result.response.statusText || `HTTP ${result.response.status}`;
            lastError = new Error(message);
            if (result.response.status !== 404) break;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            break;
        }
    }

    throw lastError || new Error('NastyTavern update failed.');
}
