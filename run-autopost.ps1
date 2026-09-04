# ============================================================
# YT AutoPosting — local automation script
# Runs Generate SEO + queues scheduled posts (real YouTube
# publishAt scheduling, honoring your configured target
# country/times in Admin Panel) against your LOCAL dev server.
# Starts npm run dev automatically if it isn't already running.
# ============================================================

# --- FILL THESE IN ---
$projectPath = "G:\Users\Administrator\Desktop\youtube-autopost-app"
$adminSecret = "Admin12345"
# ----------------------

$baseUrl = "http://localhost:3000"
$logFile = Join-Path $projectPath "autopost-log.txt"

function Log($msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $msg"
    Write-Output $line
    Add-Content -Path $logFile -Value $line
}

function Test-ServerUp {
    $result = Test-NetConnection -ComputerName "localhost" -Port 3000 -WarningAction SilentlyContinue
    return $result.TcpTestSucceeded
}

Log "=== Run started ==="

if (Test-ServerUp) {
    Log "Server already running, skipping startup."
} else {
    Log "Starting npm run dev..."
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectPath'; npm run dev" -WindowStyle Minimized

    $maxWait = 60
    $waited = 0
    while (-not (Test-ServerUp) -and $waited -lt $maxWait) {
        Start-Sleep -Seconds 3
        $waited += 3
    }

    if (-not (Test-ServerUp)) {
        Log "ERROR: Server did not start within $maxWait seconds. Aborting this run."
        exit 1
    }
    Log "Server is up (took ~$waited seconds)."
}

$headers = @{ "x-admin-secret" = $adminSecret; "Content-Type" = "application/json" }

Log "Running Generate SEO..."
try {
    $seoResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/generate-seo" -Method POST -Headers $headers -Body (@{count = 10} | ConvertTo-Json)
    Log ("Generate SEO result: " + ($seoResult.log -join " | "))
} catch {
    Log "Generate SEO FAILED: $($_.Exception.Message)"
}

Log "Queuing scheduled posts (honors your configured target country/times)..."
try {
    $postResult = Invoke-RestMethod -Uri "$baseUrl/api/admin/daily-post" -Method POST -Headers $headers -Body (@{mode = "schedule"} | ConvertTo-Json)
    Log ("Schedule result: " + ($postResult.log -join " | "))
} catch {
    Log "Scheduling FAILED: $($_.Exception.Message)"
}

Log "=== Run finished ==="
