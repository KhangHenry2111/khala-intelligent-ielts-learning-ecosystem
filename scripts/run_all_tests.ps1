$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\")).Path
Set-Location $Root
$Python = if (Test-Path (Join-Path $Root "venv\Scripts\python.exe")) {
    Join-Path $Root "venv\Scripts\python.exe"
} elseif (Test-Path (Join-Path $Root "..\venv\Scripts\python.exe")) {
    Join-Path $Root "..\venv\Scripts\python.exe"
} else {
    "python.exe"
}

$results = [System.Collections.Generic.List[object]]::new()

function Invoke-TestGroup {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments
    )

    Write-Host "`n=== $Name ===" -ForegroundColor Cyan
    & $FilePath @Arguments
    $exitCode = $LASTEXITCODE
    $status = if ($exitCode -eq 0) { "PASSED" } else { "FAILED" }
    $color = if ($exitCode -eq 0) { "Green" } else { "Red" }
    Write-Host "[$status] $Name (exit code: $exitCode)" -ForegroundColor $color
    $results.Add([pscustomobject]@{ Name = $Name; ExitCode = $exitCode })
}

Invoke-TestGroup "Python unit and integration tests" $Python @(
    "-m", "pytest", "AI_quiz/tests", "tests", "-v"
)

Invoke-TestGroup ".NET unit tests" "dotnet" @(
    "test", "tests/AuthPortal.Tests/AuthPortal.Tests.csproj", "--no-restore", "--logger", "console;verbosity=normal"
)

$frontend = Join-Path $Root "auth-portal\ClientApp"
if (Test-Path (Join-Path $frontend "package.json")) {
    Push-Location $frontend
    try {
        Invoke-TestGroup "Frontend production build" "npm" @("run", "build")
    }
    finally {
        Pop-Location
    }
}

Write-Host "`n=== Test summary ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
$failed = @($results | Where-Object { $_.ExitCode -ne 0 }).Count
if ($failed -gt 0) {
    Write-Host "$failed test group(s) failed." -ForegroundColor Red
    exit 1
}

Write-Host "All test groups passed." -ForegroundColor Green
exit 0