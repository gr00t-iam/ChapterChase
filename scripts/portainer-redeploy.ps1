param(
  [Parameter(Mandatory = $false)]
  [string]$StackName = $env:PORTAINER_STACK_NAME,

  [Parameter(Mandatory = $false)]
  [string]$PortainerUrl = $env:PORTAINER_URL,

  [Parameter(Mandatory = $false)]
  [string]$Token = $env:PORTAINER_TOKEN,

  [Parameter(Mandatory = $false)]
  [int]$EndpointId = $(if ($env:PORTAINER_ENDPOINT_ID) { [int]$env:PORTAINER_ENDPOINT_ID } else { 0 }),

  [Parameter(Mandatory = $false)]
  [string]$SecretsPath = '',

  [switch]$Insecure = $true,
  [switch]$Prune = $false,
  [switch]$RepullImageAndRedeploy = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $SecretsPath) {
  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $SecretsPath = Join-Path $scriptDir '..\\secrets\\portainer.env'
}

function Read-DotEnvFile([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return @{}
  }
  $result = @{}
  foreach ($line in (Get-Content -LiteralPath $Path)) {
    $trimmed = ('' + $line).Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $parts = $trimmed.Split('=', 2)
    if ($parts.Count -ne 2) { continue }
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $result[$key] = $value
  }
  return $result
}

function Normalize-PortainerBaseUrl([string]$Url) {
  $u = ('' + $Url).Trim()
  if (-not $u) { return '' }
  # Allow someone to paste the UI URL that includes /#!/...
  $hashIndex = $u.IndexOf('/#!/')
  if ($hashIndex -gt 0) {
    $u = $u.Substring(0, $hashIndex)
  }
  return $u.TrimEnd('/')
}

$secrets = Read-DotEnvFile -Path $SecretsPath
if (-not $PortainerUrl -and $secrets.ContainsKey('PORTAINER_URL')) { $PortainerUrl = $secrets['PORTAINER_URL'] }
if (-not $Token -and $secrets.ContainsKey('PORTAINER_TOKEN')) { $Token = $secrets['PORTAINER_TOKEN'] }
if (-not $StackName -and $secrets.ContainsKey('PORTAINER_STACK_NAME')) { $StackName = $secrets['PORTAINER_STACK_NAME'] }
if ($EndpointId -eq 0 -and $secrets.ContainsKey('PORTAINER_ENDPOINT_ID')) { $EndpointId = [int]$secrets['PORTAINER_ENDPOINT_ID'] }

$PortainerUrl = Normalize-PortainerBaseUrl -Url $PortainerUrl
if (-not $PortainerUrl) { throw "PORTAINER_URL is required (env var or $SecretsPath)." }
if (-not $Token) { throw "PORTAINER_TOKEN is required (env var or $SecretsPath)." }
if (-not $StackName) { throw "StackName is required (pass -StackName, set PORTAINER_STACK_NAME, or set it in $SecretsPath)." }

$apiBase = "$PortainerUrl/api"
$headers = @{ 'X-API-Key' = $Token }

function Invoke-Portainer([string]$Method, [string]$Path, $Body = $null) {
  $uri = if ($Path.StartsWith('http')) { $Path } else { "$apiBase$Path" }
  $params = @{
    Method      = $Method
    Uri         = $uri
    Headers     = $headers
    ContentType = 'application/json'
  }
  if ($Body -ne $null) {
    $params.Body = ($Body | ConvertTo-Json -Depth 12)
  }
  if ($Insecure -and $PSVersionTable.PSVersion.Major -ge 7) {
    $params.SkipCertificateCheck = $true
  }
  return Invoke-RestMethod @params
}

if ($Insecure -and $PSVersionTable.PSVersion.Major -lt 7) {
  # Best-effort for Windows PowerShell 5.1 on self-signed Portainer certs.
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
}

if ($EndpointId -eq 0) {
  $endpoints = @(Invoke-Portainer -Method 'GET' -Path '/endpoints')
  if ($endpoints.Count -eq 1) {
    $EndpointId = [int]$endpoints[0].Id
  } else {
    $names = ($endpoints | ForEach-Object { "$($_.Id):$($_.Name)" }) -join ', '
    throw "Multiple Portainer environments found. Re-run with -EndpointId. Available: $names"
  }
}

$stacks = @(Invoke-Portainer -Method 'GET' -Path '/stacks')
$matches = @($stacks | Where-Object { $_.Name -eq $StackName -and [int]$_.EndpointId -eq $EndpointId })
if ($matches.Count -eq 0) {
  $byName = @($stacks | Where-Object { $_.Name -eq $StackName })
  if ($byName.Count -gt 0) {
    $ids = ($byName | ForEach-Object { "EndpointId=$($_.EndpointId) Id=$($_.Id)" }) -join '; '
    throw "Found stack '$StackName' but not on EndpointId=$EndpointId. Matches: $ids"
  }
  $known = ($stacks | Select-Object -ExpandProperty Name -Unique | Sort-Object) -join ', '
  throw "Stack '$StackName' not found on EndpointId=$EndpointId. Known stacks: $known"
}
if ($matches.Count -gt 1) {
  $ids = ($matches | ForEach-Object { "Id=$($_.Id)" }) -join ', '
  throw "Multiple stacks named '$StackName' found for EndpointId=$EndpointId ($ids). Rename one or specify a unique name."
}

$stack = $matches[0]
$stackId = [int]$stack.Id

Write-Host "Redeploying stack '$StackName' (Id=$stackId) on EndpointId=$EndpointId..."

if ($null -ne $stack.GitConfig -and $stack.GitConfig) {
  $payload = @{
    Prune                 = [bool]$Prune
    RepullImageAndRedeploy = [bool]$RepullImageAndRedeploy
    Env                   = @($stack.Env)
  }
  [void](Invoke-Portainer -Method 'PUT' -Path ("/stacks/$stackId/git/redeploy?endpointId=$EndpointId") -Body $payload)
  Write-Host "OK: Git stack redeployed."
  exit 0
}

# File / web-editor stack: re-submit the stored compose content and env to trigger a redeploy.
$file = Invoke-Portainer -Method 'GET' -Path ("/stacks/$stackId/file")
$stackFileContent = $file.StackFileContent
if (-not $stackFileContent) {
  throw "Unable to load stack file content for stack Id=$stackId."
}

$updatePayload = @{
  StackFileContent = $stackFileContent
  Env              = @($stack.Env)
  Prune            = [bool]$Prune
}

try {
  [void](Invoke-Portainer -Method 'PUT' -Path ("/stacks/$stackId?endpointId=$EndpointId") -Body $updatePayload)
  Write-Host "OK: Stack updated and redeployed."
} catch {
  throw "Stack redeploy failed. If this stack was created from Git, redeploy it from Git instead. Underlying error: $($_.Exception.Message)"
}
