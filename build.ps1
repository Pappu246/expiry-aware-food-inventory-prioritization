param([switch]$Test,[switch]$Metrics,[switch]$AllocFail)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Compiler = Get-Command gcc -ErrorAction SilentlyContinue
if (-not $Compiler) { $Compiler = Get-Command clang -ErrorAction SilentlyContinue }
if (-not $Compiler) { throw "No C compiler found. Install GCC or Clang and add it to PATH." }
New-Item -ItemType Directory -Force -Path (Join-Path $Root "build") | Out-Null
$Common = @("-std=c11","-Wall","-Wextra","-Wpedantic","-Werror","-O2","-D_POSIX_C_SOURCE=200809L","-Iinclude")
if ($AllocFail -and ($Test -or $Metrics)) { throw "Use -AllocFail by itself; do not combine it with -Test or -Metrics." }
if ($AllocFail) { $Output = Join-Path $Root "build\fefo_tests_alloc_fail.exe"; $Sources = @("tests/test_main.c","src/engine.c"); $Common = $Common + @("-DFEFO_TEST_ALLOC_FAILURE") }
elseif ($Metrics) { $Output = Join-Path $Root "build\fefo_operations.exe"; $Sources = @("tests/operation_counts.c","src/engine.c"); $Common = $Common + @("-DFEFO_ENABLE_OPERATION_METRICS") }
elseif ($Test) { $Output = Join-Path $Root "build\fefo_tests.exe"; $Sources = @("tests/test_main.c","src/engine.c") }
else { $Output = Join-Path $Root "build\fefo.exe"; $Sources = @("src/main.c","src/engine.c") }
foreach ($Source in $Sources) { if (-not (Test-Path (Join-Path $Root $Source))) { throw "Missing source file: $Source" } }
Write-Host "Compiler: $($Compiler.Source)"
$CompilerArgs = $Common + $Sources + @("-lm","-o",$Output)
& $Compiler.Source @CompilerArgs
if ($LASTEXITCODE -ne 0) { throw "Compilation failed with exit code $LASTEXITCODE" }
if ($Test -or $Metrics -or $AllocFail) { & $Output; if ($LASTEXITCODE -ne 0) { throw "Command failed with exit code $LASTEXITCODE" } }
Write-Host "Build completed: $Output"
