# Deploy fast translation service to Google Cloud Run.
# Usage: .\deploy.ps1 [-Project cerber-495808] [-Region us-central1]

param(
    [string]$Project = 'cerber-495808',
    [string]$Region = 'us-central1',
    [string]$Service = 'screen-translator-translate',
    [string]$Repo = 'screen-translator'
)

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Image = "$Region-docker.pkg.dev/$Project/$Repo/${Service}:latest"

function Invoke-Gcloud {
    param([Parameter(Mandatory)][string[]]$Args)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & gcloud @Args
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "gcloud failed ($code): gcloud $($Args -join ' ')" }
}

Write-Host "Project: $Project  Region: $Region  Service: $Service"

Invoke-Gcloud @('services', 'enable', 'run.googleapis.com', 'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com', "--project=$Project")

$repoList = @(Invoke-Gcloud @('artifacts', 'repositories', 'list', "--location=$Region", "--project=$Project", '--format=value(name)'))
if ($repoList -notcontains $Repo) {
    Write-Host "Creating Artifact Registry repo: $Repo"
    Invoke-Gcloud @('artifacts', 'repositories', 'create', $Repo, '--repository-format=docker', "--location=$Region", "--project=$Project", '--description=Screen Translator images')
    Invoke-Gcloud @('artifacts', 'repositories', 'describe', $Repo, '--location', $Region, "--project=$Project", '--format=value(name)') | Out-Null
}

if (-not $env:API_KEY) {
    $env:API_KEY = [guid]::NewGuid().ToString('N')
}
$ApiKey = $env:API_KEY

Write-Host "Building image (model download ~5-10 min on first build)..."
Invoke-Gcloud @('builds', 'submit', $Root, '--tag', $Image, "--project=$Project", '--timeout=3600')

Write-Host "Deploying to Cloud Run..."
Invoke-Gcloud @(
    'run', 'deploy', $Service,
    '--image', $Image,
    '--region', $Region,
    '--platform', 'managed',
    '--allow-unauthenticated',
    '--memory', '4Gi',
    '--cpu', '2',
    '--min-instances', '1',
    '--max-instances', '4',
    '--concurrency', '8',
    '--timeout', '60',
    '--port', '8080',
    '--set-env-vars', "API_KEY=$ApiKey",
    "--project=$Project"
)

$Url = Invoke-Gcloud @('run', 'services', 'describe', $Service, '--region', $Region, "--project=$Project", '--format=value(status.url)')

$CredsPath = Join-Path $Root '.deploy-credentials.json'
@{
    url = $Url
    api_key = $ApiKey
    service = $Service
    region = $Region
    project = $Project
} | ConvertTo-Json | Set-Content -Path $CredsPath -Encoding utf8NoBOM

Write-Host ""
Write-Host "=== Deployed ==="
Write-Host "URL: $Url"
Write-Host "Credentials saved to: $CredsPath"
Write-Host "Set engine=gcp_local in Screen Translator settings."
