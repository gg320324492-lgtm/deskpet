import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createReleaseConfiguration, safeReleaseSummary } from '../scripts/release-policy.mjs';

const packageJson = { version: '1.2.3' };
const qualityWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const releaseWorkflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
const signatureVerifier = readFileSync(new URL('../scripts/verify-signatures.ps1', import.meta.url), 'utf8');

test('GitHub workflows pin Node 24 actions to immutable commits', () => {
    const expectedPins = [
        'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
        'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
    ];

    for (const workflow of [qualityWorkflow, releaseWorkflow]) {
        for (const pin of expectedPins) assert.match(workflow, new RegExp(pin));
        assert.doesNotMatch(workflow, /uses:\s+actions\/[\w-]+@v\d+/);
    }
    assert.match(
        releaseWorkflow,
        /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/,
    );
});

test('quality workflow validates pull requests with read-only permissions', () => {
    assert.match(qualityWorkflow, /\n  pull_request:\s*\n/);
    assert.match(qualityWorkflow, /\n  push:\s*\n\s+branches:\s*\n\s+- main/);
    assert.match(qualityWorkflow, /permissions:\s*\n\s+contents: read/);
    assert.match(qualityWorkflow, /run: npm ci/);
    assert.match(qualityWorkflow, /run: npm test/);
    assert.match(qualityWorkflow, /run: npm run manifest:check/);
    assert.match(qualityWorkflow, /run: npm audit --audit-level=high/);
    assert.doesNotMatch(qualityWorkflow, /secrets\.|contents: write|environment:/);
});

test('GitHub release configuration is public, signed and secret-free', () => {
    const secret = 'base64-private-certificate';
    const config = createReleaseConfiguration({
        RELEASE_PROVIDER: 'github',
        GITHUB_REPOSITORY: 'owner/date-night-girl',
        WIN_CSC_LINK: secret,
        RELEASE_TAG: 'v1.2.3',
    }, packageJson);
    assert.deepEqual(config.publish, {
        provider: 'github',
        owner: 'owner',
        repo: 'date-night-girl',
        channel: 'latest',
        releaseType: 'release',
    });
    assert.equal(JSON.stringify(config).includes(secret), false);
    assert.equal(JSON.stringify(safeReleaseSummary(config)).includes(secret), false);
    assert.equal(config.signing.mode, 'pfx');
});

test('generic update feeds require credential-free HTTPS URLs', () => {
    const valid = createReleaseConfiguration({
        RELEASE_PROVIDER: 'generic',
        UPDATE_URL: 'https://updates.example.com/deskpet/',
        WIN_CSC_LINK: 'certificate',
    }, packageJson);
    assert.equal(valid.publish.url, 'https://updates.example.com/deskpet');
    assert.throws(() => createReleaseConfiguration({
        RELEASE_PROVIDER: 'generic',
        UPDATE_URL: 'http://updates.example.com',
        WIN_CSC_LINK: 'certificate',
    }, packageJson), /HTTPS/);
    assert.throws(() => createReleaseConfiguration({
        RELEASE_PROVIDER: 'generic',
        UPDATE_URL: 'https://user:pass@updates.example.com',
        WIN_CSC_LINK: 'certificate',
    }, packageJson), /without credentials/);
});

test('release preflight rejects missing signing credentials and tag drift', () => {
    assert.throws(() => createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
    }, packageJson), /WIN_CSC_LINK/);
    assert.throws(() => createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
        WIN_CSC_LINK: 'certificate',
        RELEASE_TAG: 'v9.9.9',
    }, packageJson), /release tag/);
});

test('private GitHub updater configurations are rejected to avoid client tokens', () => {
    assert.throws(() => createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
        WIN_CSC_LINK: 'certificate',
        RELEASE_PRIVATE: 'true',
    }, packageJson), /client tokens/);
});

test('beta channels require beta semver and generate beta metadata', () => {
    const beta = createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
        WIN_CSC_LINK: 'certificate',
        RELEASE_CHANNEL: 'beta',
    }, { version: '1.3.0-beta.2' });
    assert.equal(beta.publish.channel, 'beta');
    assert.equal(beta.publish.releaseType, 'prerelease');
    assert.throws(() => createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
        WIN_CSC_LINK: 'certificate',
        RELEASE_CHANNEL: 'beta',
    }, packageJson), /-beta/);
});

test('certificate-store and Azure signing modes validate only non-secret metadata', () => {
    const store = createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
        SIGNING_MODE: 'store',
        WIN_CERTIFICATE_SUBJECT_NAME: 'Example Publisher LLC',
    }, packageJson);
    assert.equal(store.signing.certificateSubjectName, 'Example Publisher LLC');

    const azureSecret = 'azure-secret-never-returned';
    const azure = createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
        SIGNING_MODE: 'azure',
        AZURE_TENANT_ID: 'tenant',
        AZURE_CLIENT_ID: 'client',
        AZURE_CLIENT_SECRET: azureSecret,
        AZURE_TRUSTED_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net/',
        AZURE_CODE_SIGNING_ACCOUNT_NAME: 'deskpet-signing',
        AZURE_CERTIFICATE_PROFILE_NAME: 'public-trust',
        AZURE_PUBLISHER_NAME: 'Example Publisher LLC',
    }, packageJson);
    assert.equal(azure.signing.azure.endpoint, 'https://eus.codesigning.azure.net');
    assert.equal(JSON.stringify(azure).includes(azureSecret), false);
});

test('self-signed CI verification is explicit and never modifies trust stores', () => {
    assert.match(releaseWorkflow, /ALLOW_SELF_SIGNED_RELEASE:.*vars\.ALLOW_SELF_SIGNED_RELEASE/);
    assert.doesNotMatch(releaseWorkflow, /TrustedPublisher|X509Store/);
    assert.match(signatureVerifier, /\[switch\] \$AllowSelfSigned/);
    assert.match(signatureVerifier, /SignerCertificate\.Thumbprint -ne \$expectedCertificate\.Thumbprint/);
    assert.match(signatureVerifier, /SignatureStatus\]::NotTrusted/);
    assert.match(signatureVerifier, /SignatureStatus\]::UnknownError/);
    assert.match(signatureVerifier, /Join-Path \$PSHOME 'Modules\\Microsoft\.PowerShell\.Security/);
    assert.match(signatureVerifier, /Import-Module -Name \$securityModulePath -ErrorAction Stop/);
});

test('self-signed release policy is opt-in and restricted to PFX mode', () => {
    const config = createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
        WIN_CSC_LINK: 'certificate',
        ALLOW_SELF_SIGNED_RELEASE: 'true',
    }, packageJson);
    assert.equal(config.signing.allowSelfSigned, true);
    assert.equal(safeReleaseSummary(config).selfSigned, true);
    assert.throws(() => createReleaseConfiguration({
        GITHUB_REPOSITORY: 'owner/repo',
        WIN_CSC_LINK: 'certificate',
        ALLOW_SELF_SIGNED_RELEASE: 'sometimes',
    }, packageJson), /true or false/);
});
