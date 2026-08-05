# mailer-and(안드로이드) 테스터들에게 "새 버전 나왔어요" 알림을 보낸다.
# 버전명은 mailer-and/app/build.gradle.kts 에서 자동으로 읽어온다 — 안 맞으면 -Version 으로 덮어써라.
# Notes(무엇이 바뀌었는지)는 매번 직접 써야 한다 — 안 쓰면 실행이 안 된다.
#
# 사용법:
#   .\scripts\notify-app-update.ps1 -Notes "키보드가 화면 가리던 버그 고침, 다크모드 개선"
#   .\scripts\notify-app-update.ps1 -Notes "긴급 버그 수정" -Version "1.3"

param(
    [Parameter(Mandatory=$true)]
    [string]$Notes,

    [string]$Version,
    [string]$Url = "https://play.google.com/store/apps/details?id=kr.mdl.mailer",
    [string]$Endpoint = "https://mdl.kr/api/app-update-notify",
    [string]$Secret = $env:APP_UPDATE_NOTIFY_SECRET
)

if (-not $Secret) {
    Write-Error "시크릿이 없습니다. `$env:APP_UPDATE_NOTIFY_SECRET 를 설정하거나 -Secret 인자로 넘겨주세요 (.env.local의 APP_UPDATE_NOTIFY_SECRET 값)."
    exit 1
}

if (-not $Version) {
    $gradleFile = Join-Path $PSScriptRoot "..\..\mailer-and\app\build.gradle.kts"
    if (Test-Path $gradleFile) {
        $content = Get-Content $gradleFile -Raw
        if ($content -match 'versionNameOverride"\)\s*as\s*String\?\)\s*\?\:\s*"([^"]+)"') {
            $Version = $Matches[1]
        }
    }
}

if (-not $Version) {
    Write-Error "버전명을 자동으로 못 찾았습니다. -Version 인자로 직접 넘겨주세요 (예: -Version 1.3)"
    exit 1
}

$title = "MailXC v$Version 업데이트"

Write-Host "제목: $title" -ForegroundColor Cyan
Write-Host "내용: $Notes" -ForegroundColor Cyan

$body = @{ title = $title; body = $Notes; url = $Url } | ConvertTo-Json

$response = Invoke-RestMethod -Uri $Endpoint -Method Post `
    -Headers @{ "x-app-update-secret" = $Secret } `
    -ContentType "application/json; charset=utf-8" `
    -Body ([System.Text.Encoding]::UTF8.GetBytes($body))

Write-Host "전송 완료:" -ForegroundColor Green
$response | ConvertTo-Json
