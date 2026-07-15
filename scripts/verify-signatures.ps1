param(
    [switch] $AllowSelfSigned,

    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]] $Paths
)

$ErrorActionPreference = 'Stop'
if ($Paths.Count -eq 0) {
    throw 'No executable artifacts were supplied for signature verification.'
}

$expectedCertificate = $null
if ($AllowSelfSigned) {
    if ([string]::IsNullOrWhiteSpace($env:WIN_CSC_LINK) -or
        [string]::IsNullOrWhiteSpace($env:WIN_CSC_KEY_PASSWORD)) {
        throw 'Self-signed verification requires WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD.'
    }
    try {
        if ([IO.File]::Exists($env:WIN_CSC_LINK)) {
            $pfxBytes = [IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $env:WIN_CSC_LINK).Path)
        } else {
            $pfxBytes = [Convert]::FromBase64String($env:WIN_CSC_LINK)
        }
        $expectedCertificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
            $pfxBytes,
            $env:WIN_CSC_KEY_PASSWORD,
            [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet
        )
    } catch {
        throw 'Unable to load the self-signed certificate used for this release.'
    }
    if ($expectedCertificate.Subject -ne $expectedCertificate.Issuer) {
        throw 'ALLOW_SELF_SIGNED_RELEASE only accepts a self-signed certificate.'
    }
    $codeSigningOid = '1.3.6.1.5.5.7.3.3'
    $hasCodeSigningEku = $expectedCertificate.Extensions |
        Where-Object { $_ -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension] } |
        ForEach-Object { $_.EnhancedKeyUsages } |
        Where-Object { $_.Value -eq $codeSigningOid }
    if (-not $hasCodeSigningEku) {
        throw 'The self-signed certificate is not valid for code signing.'
    }
}

foreach ($candidate in $Paths) {
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    if ([IO.Path]::GetExtension($resolved) -ne '.exe') {
        throw "Unexpected non-executable artifact: $resolved"
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $resolved
    if (-not $signature.SignerCertificate) {
        throw "Invalid Authenticode signature ($($signature.Status)): $resolved"
    }
    if ($signature.Status -eq [System.Management.Automation.SignatureStatus]::Valid) {
        Write-Output "[signature] trusted: $([IO.Path]::GetFileName($resolved)) - $($signature.SignerCertificate.Subject)"
        continue
    }
    $allowedSelfSignedStatus = $signature.Status -in @(
        [System.Management.Automation.SignatureStatus]::NotTrusted,
        [System.Management.Automation.SignatureStatus]::UnknownError
    )
    if (-not $AllowSelfSigned -or
        -not $allowedSelfSignedStatus -or
        $signature.SignerCertificate.Thumbprint -ne $expectedCertificate.Thumbprint -or
        $signature.SignerCertificate.Subject -ne $signature.SignerCertificate.Issuer) {
        throw "Invalid Authenticode signature ($($signature.Status)): $resolved"
    }
    Write-Output "[signature] self-signed: $([IO.Path]::GetFileName($resolved)) - $($signature.SignerCertificate.Subject)"
}
