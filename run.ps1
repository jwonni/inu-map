# main 브랜치 최신 코드를 받아서 캠퍼스 지도를 로컬 서버로 띄우는 스크립트
#   사용:  .\run.ps1            → main 최신 받고 실행
#          .\run.ps1 -NoPull    → 받지 않고 현재 코드로 실행
#          .\run.ps1 -Page inu-campus-map.html   → 다른 페이지로 열기 (기본 index.html)
#          .\run.ps1 -Port 8090
param(
  [switch]$NoPull,
  [string]$Page = 'index.html',
  [int]$Port = 8080
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not $NoPull) {
  $branch = git branch --show-current
  $dirty = git status --porcelain
  if ($dirty) {
    Write-Host "작업 중인 변경이 있어 main 으로 바꾸지 않습니다. 먼저 커밋하거나 stash 하세요:" -ForegroundColor Yellow
    git status --short
    Write-Host "현재 브랜치($branch) 그대로 실행합니다." -ForegroundColor Yellow
  } else {
    if ($branch -ne 'main') { git checkout main }
    Write-Host "origin/main 받는 중..." -ForegroundColor Cyan
    git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { Write-Host "pull 실패 (충돌?). 현재 코드로 실행합니다." -ForegroundColor Yellow }
  }
  git log --oneline -1
}

$dir = Join-Path $root 'campus-map'
if (-not (Test-Path (Join-Path $dir $Page))) { throw "페이지를 찾을 수 없습니다: campus-map\$Page" }

# 포트가 이미 쓰이면 다음 포트
while (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { $Port++ }

Write-Host "http://localhost:$Port/$Page  (종료: Ctrl+C)" -ForegroundColor Green
Start-Process "http://localhost:$Port/$Page"
python -m http.server $Port --directory $dir --bind 127.0.0.1
