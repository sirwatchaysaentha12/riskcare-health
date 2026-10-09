$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot '.venv-pm25-forecast\Scripts\python.exe'
$logPath = Join-Path $PSScriptRoot 'pm25_v27_daily_publish.log'
$requiredNames = @('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')

# Task Scheduler may not inherit environment changes made after the user logged in.
# Read the user's environment values into this process without echoing them.
foreach ($name in $requiredNames) {
    $value = [Environment]::GetEnvironmentVariable($name, 'User')
    if ($value) { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
}

if (-not (Test-Path -LiteralPath $python)) {
    throw 'PM25_PUBLISH_PYTHON_RUNTIME_MISSING'
}
if (-not ($env:SUPABASE_URL -or $env:NEXT_PUBLIC_SUPABASE_URL) -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
    throw 'PM25_PUBLISH_ENVIRONMENT_NOT_CONFIGURED'
}

Push-Location $PSScriptRoot
try {
    & $python 'publish_v27_forecasts.py' --publish --allow-underperforming-model 2>&1 | Out-File -LiteralPath $logPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "PM25_PUBLISH_FAILED_EXIT_$LASTEXITCODE" }
} finally {
    Pop-Location
}
