$ErrorActionPreference = "Stop"

Write-Host "[Looper] 檢查 pnpm..."
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw "找不到 pnpm。請先安裝 Node.js 22 與 pnpm 10.13.1。"
}

Write-Host "[Looper] 安裝相依套件..."
pnpm install --no-frozen-lockfile

Write-Host "[Looper] 先執行 MVP 流程驗證..."
pnpm test:mvp
if ($LASTEXITCODE -ne 0) {
  throw "MVP 流程驗證失敗，已停止啟動。"
}

Write-Host "[Looper] 啟動 Web、Admin、Merchant 與 API..."
$process = Start-Process -FilePath "pnpm" -ArgumentList "dev" -PassThru -NoNewWindow

Start-Sleep -Seconds 8

$urls = @(
  "http://localhost:3000",
  "http://localhost:3002",
  "http://localhost:3001"
)

foreach ($url in $urls) {
  Start-Process $url
}

Write-Host ""
Write-Host "Looper MVP 已啟動："
Write-Host "玩家端    http://localhost:3000"
Write-Host "店家端    http://localhost:3002"
Write-Host "平台後台  http://localhost:3001"
Write-Host "API        http://localhost:4000/health"
Write-Host ""
Write-Host "關閉此視窗或按 Ctrl+C 後，再結束 pnpm dev 程序。"

Wait-Process -Id $process.Id
