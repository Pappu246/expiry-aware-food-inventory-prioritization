param(
    [switch]$Test
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Compiler = Get-Command gcc -ErrorAction SilentlyContinue
if (-not $Compiler) {
    $Compiler = Get-Command clang -ErrorAction SilentlyContinue
}
if (-not $Compiler) {
    Write-Error "No C compiler found. Install GCC or Clang and ensure it is available on PATH."
    exit 1
}

$BuildDir = Join-Path $Root "build"
New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null

$Common = @(
    "-std=c11",
    "-Wall",
    "-Wextra",
    "-Wpedantic",
    "-Werror",
    "-O2",
    "-Iinclude"
)

$CoreSources = @(
    "src/food_batch.c",
    "src/min_heap.c",
    "src/hash_table.c",
    "src/fefo_heap.c",
    "src/fefo_linear.c",
    "src/fifo_policy.c",
    "src/event_trace.c",
    "src/waste_ledger.c",
    "src/simulation.c",
    "src/benchmark.c"
)

$Missing = @()
foreach ($Source in $CoreSources) {
    if (-not (Test-Path (Join-Path $Root $Source))) {
        $Missing += $Source
    }
}

if ($Missing.Count -gt 0) {
    Write-Error ("Implementation is not complete. Missing source files: " + ($Missing -join ", "))
    exit 2
}

if ($Test) {
    $TestSource = Join-Path $Root "tests/test_main.c"
    if (-not (Test-Path $TestSource)) {
        Write-Error "Test source tests/test_main.c has not been implemented yet."
        exit 2
    }
    $Output = Join-Path $BuildDir "fefo_tests.exe"
    $Sources = @($TestSource) + $CoreSources
} else {
    $MainSource = Join-Path $Root "src/main.c"
    if (-not (Test-Path $MainSource)) {
        Write-Error "CLI source src/main.c has not been implemented yet."
        exit 2
    }
    $Output = Join-Path $BuildDir "fefo.exe"
    $Sources = @($MainSource) + $CoreSources
}

$CompilerArgs = @($Common) + $Sources + @("-o", $Output)
Write-Host "Compiler: $($Compiler.Source)"
Write-Host "Building: $Output"
& $Compiler.Source @CompilerArgs

if ($LASTEXITCODE -ne 0) {
    Write-Error "Compilation failed with exit code $LASTEXITCODE."
    exit $LASTEXITCODE
}

if ($Test) {
    Write-Host "Running test suite..."
    & $Output
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests failed with exit code $LASTEXITCODE."
        exit $LASTEXITCODE
    }
}

Write-Host "Build completed successfully."
