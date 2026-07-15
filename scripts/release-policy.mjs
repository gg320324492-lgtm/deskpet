const PROVIDERS = new Set(['github', 'generic']);
const CHANNELS = new Set(['stable', 'beta']);
const SIGNING_MODES = new Set(['pfx', 'store', 'azure']);

function required(value, name, maxLength = 4_096) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength || value.includes('\0')) {
        throw new Error(`${name} is required`);
    }
    return value.trim();
}

function safeName(value, name) {
    const normalized = required(value, name, 160);
    if (/[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`${name} contains unsupported characters`);
    return normalized;
}

function httpsUrl(value, name) {
    const raw = required(value, name, 2_048);
    let url;
    try { url = new URL(raw); } catch (_) { throw new Error(`${name} must be an absolute HTTPS URL`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
        throw new Error(`${name} must be an HTTPS URL without credentials, query or fragment`);
    }
    return url.toString().replace(/\/$/, '');
}

function githubRepository(value) {
    const repository = required(value, 'GITHUB_REPOSITORY', 220);
    const match = repository.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
    if (!match || match[1].startsWith('.') || match[2].startsWith('.')) {
        throw new Error('GITHUB_REPOSITORY must use owner/repository format');
    }
    return { owner: match[1], repo: match[2] };
}

function signingConfiguration(env) {
    const mode = (env.SIGNING_MODE || 'pfx').trim().toLowerCase();
    if (!SIGNING_MODES.has(mode)) throw new Error('SIGNING_MODE must be pfx, store or azure');
    const selfSignedValue = String(env.ALLOW_SELF_SIGNED_RELEASE || '').trim().toLowerCase();
    if (selfSignedValue && selfSignedValue !== 'true' && selfSignedValue !== 'false') {
        throw new Error('ALLOW_SELF_SIGNED_RELEASE must be true or false');
    }
    const allowSelfSigned = selfSignedValue === 'true';
    if (allowSelfSigned && mode !== 'pfx') {
        throw new Error('ALLOW_SELF_SIGNED_RELEASE requires pfx signing mode');
    }
    if (mode === 'pfx') {
        if (!(env.WIN_CSC_LINK || env.CSC_LINK)) {
            throw new Error('WIN_CSC_LINK or CSC_LINK is required for signed release builds');
        }
        return { mode, allowSelfSigned };
    }
    if (mode === 'store') {
        return {
            mode,
            allowSelfSigned,
            certificateSubjectName: safeName(env.WIN_CERTIFICATE_SUBJECT_NAME, 'WIN_CERTIFICATE_SUBJECT_NAME'),
        };
    }

    required(env.AZURE_TENANT_ID, 'AZURE_TENANT_ID', 128);
    required(env.AZURE_CLIENT_ID, 'AZURE_CLIENT_ID', 128);
    required(env.AZURE_CLIENT_SECRET, 'AZURE_CLIENT_SECRET', 1_024);
    return {
        mode,
        allowSelfSigned,
        azure: {
            endpoint: httpsUrl(env.AZURE_TRUSTED_SIGNING_ENDPOINT, 'AZURE_TRUSTED_SIGNING_ENDPOINT'),
            codeSigningAccountName: safeName(env.AZURE_CODE_SIGNING_ACCOUNT_NAME, 'AZURE_CODE_SIGNING_ACCOUNT_NAME'),
            certificateProfileName: safeName(env.AZURE_CERTIFICATE_PROFILE_NAME, 'AZURE_CERTIFICATE_PROFILE_NAME'),
            publisherName: safeName(env.AZURE_PUBLISHER_NAME, 'AZURE_PUBLISHER_NAME'),
        },
    };
}

export function createReleaseConfiguration(env, packageJson) {
    const version = required(packageJson?.version, 'package.json version', 64);
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
        throw new Error('package.json version must be valid semver');
    }
    const channel = (env.RELEASE_CHANNEL || 'stable').trim().toLowerCase();
    if (!CHANNELS.has(channel)) throw new Error('RELEASE_CHANNEL must be stable or beta');
    if (channel === 'stable' && version.includes('-')) {
        throw new Error('stable releases cannot use a prerelease version');
    }
    if (channel === 'beta' && !/-beta(?:\.|$)/.test(version)) {
        throw new Error('beta releases must use a -beta prerelease version');
    }
    const releaseTag = env.RELEASE_TAG || (env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : '');
    if (releaseTag && releaseTag !== `v${version}`) {
        throw new Error(`release tag must be v${version}`);
    }

    const provider = (env.RELEASE_PROVIDER || 'github').trim().toLowerCase();
    if (!PROVIDERS.has(provider)) throw new Error('RELEASE_PROVIDER must be github or generic');
    if (String(env.RELEASE_PRIVATE || '').toLowerCase() === 'true') {
        throw new Error('private desktop update feeds are not supported because client tokens must not be embedded');
    }

    let publish;
    if (provider === 'github') {
        const repository = githubRepository(env.GITHUB_REPOSITORY || env.RELEASE_REPOSITORY);
        publish = {
            provider: 'github',
            owner: repository.owner,
            repo: repository.repo,
            channel: channel === 'stable' ? 'latest' : 'beta',
            releaseType: channel === 'stable' ? 'release' : 'prerelease',
        };
    } else {
        publish = {
            provider: 'generic',
            url: httpsUrl(env.UPDATE_URL, 'UPDATE_URL'),
            channel: channel === 'stable' ? 'latest' : 'beta',
        };
    }

    return {
        version,
        channel,
        provider,
        publish,
        signing: signingConfiguration(env),
    };
}

export function safeReleaseSummary(configuration) {
    return {
        version: configuration.version,
        channel: configuration.channel,
        provider: configuration.provider,
        destination: configuration.provider === 'github'
            ? `${configuration.publish.owner}/${configuration.publish.repo}`
            : configuration.publish.url,
        signingMode: configuration.signing.mode,
        selfSigned: configuration.signing.allowSelfSigned,
        forceCodeSigning: true,
    };
}
