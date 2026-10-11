param(
    [switch]$Quick,
    [switch]$OpenResults
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

function Write-Stage([string]$Message) {
    Write-Host ""
    Write-Host ("=" * 68) -ForegroundColor DarkCyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host ("=" * 68) -ForegroundColor DarkCyan
}

function Assert-NativeSuccess([string]$Stage) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Stage failed with exit code $LASTEXITCODE"
    }
}

if (-not (Get-Command gcc -ErrorAction SilentlyContinue) -and
    -not (Get-Command clang -ErrorAction SilentlyContinue)) {
    throw "GCC or Clang is required. Install a C11 compiler, then reopen VS Code."
}

Write-Stage "1/5 - Compile and run the 13 regular test groups"
& .\build.ps1 -Test
Assert-NativeSuccess "Regular tests"

Write-Stage "2/5 - Run the separate allocation-failure test build"
& .\build.ps1 -AllocFail
Assert-NativeSuccess "Allocation-failure tests"

Write-Stage "3/5 - Build the normal C11 command-line application"
& .\build.ps1
Assert-NativeSuccess "Application build"

Write-Stage "4/5 - Show the interactive-style console demo"
& .\build\fefo.exe demo
Assert-NativeSuccess "Demo"

Write-Stage "5/5 - Run a small reproducible policy simulation"
& .\build\fefo.exe simulate 100
Assert-NativeSuccess "100-batch simulation"

if (-not $Quick) {
    Write-Stage "Full evidence run - 180-row policy matrix"
    & .\build\fefo.exe experiment
    Assert-NativeSuccess "Policy experiment"

    Write-Stage "Full evidence run - five-size benchmark"
    & .\build\fefo.exe benchmark
    Assert-NativeSuccess "Structure benchmark"

    Write-Stage "Full evidence run - instrumented operation counts"
    & .\build.ps1 -Metrics
    Assert-NativeSuccess "Operation metrics"
}

$Results = Join-Path $Root "results\generated"
$Expected = @(
    "policy_simulation.csv"
)
if (-not $Quick) {
    $Expected += @(
        "policy_experiment_raw.csv",
        "policy_experiment_summary.csv",
        "structure_benchmark.csv",
        "structure_benchmark_summary.csv",
        "structure_operation_counts.csv"
    )
}

Write-Stage "Verification of generated output files"
foreach ($Name in $Expected) {
    $Path = Join-Path $Results $Name
    if (-not (Test-Path $Path) -or (Get-Item $Path).Length -le 0) {
        throw "Expected non-empty result file was not created: $Path"
    }
    Write-Host ("OK  {0} ({1:N0} bytes)" -f $Name, (Get-Item $Path).Length) -ForegroundColor Green
}

Write-Host ""
Write-Host "Demo finished. Results folder: $Results" -ForegroundColor Green
if ($OpenResults) {
    Start-Process explorer.exe $Results
}
