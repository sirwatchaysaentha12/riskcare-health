$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv-pm25-forecast\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { $python = 'python' }
if (-not ($env:SUPABASE_URL -or $env:NEXT_PUBLIC_SUPABASE_URL) -or -not $env:SUPABASE_SERVICE_ROLE_KEY -or -not $env:OPENAQ_API_KEY) {
    throw 'PM25_PIPELINE_ENVIRONMENT_NOT_CONFIGURED'
}
Push-Location $projectRoot
try {
    & $python 'notebooks/run_pm25_province_pipeline.py' --publish
    if ($LASTEXITCODE -ne 0) { throw "PM25_PIPELINE_FAILED_EXIT_$LASTEXITCODE" }
    & $python 'notebooks/pm25_accuracy_guard.py' --publish
    if ($LASTEXITCODE -ne 0) { throw "PM25_ACCURACY_GUARD_FAILED_EXIT_$LASTEXITCODE" }
} finally { Pop-Location }
