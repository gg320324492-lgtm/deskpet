param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]] $Paths
)

$ErrorActionPreference = 'Stop'
if ($Paths.Count -eq 0) {
    throw 'No executable artifacts were supplied for signature verification.'
}

foreach ($candidate in $Paths) {
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    if ([IO.Path]::GetExtension($resolved) -ne '.exe') {
        throw "Unexpected non-executable artifact: $resolved"
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $resolved
    if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid -or -not $signature.SignerCertificate) {
        throw "Invalid Authenticode signature ($($signature.Status)): $resolved"
    }
    Write-Output "[signature] valid: $([IO.Path]::GetFileName($resolved)) — $($signature.SignerCertificate.Subject)"
}
