<#
.SYNOPSIS
    Check proposed brand names against the existing catalogue.

.DESCRIPTION
    Builds the project when sources have changed, then runs the brand checker.
    This wrapper exists because "npm run brand:check -- <args>" mangles quoted arguments on
    Windows: npm rebuilds the command line through cmd.exe, which turns "Two Words" into
    ^Two^ Words^ and swallows flags such as --out.

.EXAMPLE
    .\check-brand.ps1 "Adidas" "Versace"

.EXAMPLE
    .\check-brand.ps1 --input "brand list.txt" --out results\october

.EXAMPLE
    .\check-brand.ps1 -SkipBuild "Adidas"
#>

$ErrorActionPreference = "Stop"

$checkerArgs = @()
$skipBuild = $false

foreach ($argument in $args) {
    if ($argument -is [string] -and $argument -in @("-SkipBuild", "-skipbuild", "--skip-build")) {
        $skipBuild = $true
    } else {
        $checkerArgs += $argument
    }
}

Push-Location $PSScriptRoot
try {
    if (-not $skipBuild) {
        $buildDecision = node (Join-Path $PSScriptRoot "scripts/needs-brand-build.mjs")
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
        if ($buildDecision -eq "build") {
            npm run build
            if ($LASTEXITCODE -ne 0) {
                exit $LASTEXITCODE
            }
        } elseif ($buildDecision -ne "skip") {
            throw "Unexpected build check result: $buildDecision"
        }
    }

    node (Join-Path $PSScriptRoot "dist/brand-duplicate/brand-cli.js") @checkerArgs
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
