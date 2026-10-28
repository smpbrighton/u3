param([switch]$AllowNoResources)
$ErrorActionPreference = 'Stop'
function Checked([scriptblock]$Command) {
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "명령이 실패했습니다: 종료 코드 $LASTEXITCODE" }
}
$resourceReady = $false
if ($env:U3_RESOURCE_SHA256 -match '^[a-fA-F0-9]{64}$' -and $env:U3_RESOURCE_VERSION -match '^[1-9][0-9]*$') {
    $archiveDir = Join-Path $env:U3_BUILD_CACHE 'archives'
    New-Item -ItemType Directory -Force $archiveDir | Out-Null
    $name = "u3-resources-$env:U3_RESOURCE_VERSION.tar.gz"
    $release = gh release view "resources-$env:U3_RESOURCE_VERSION" --repo smpbrighton/u3 --json isPrerelease,isDraft | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or -not $release.isPrerelease -or $release.isDraft) { throw '리소스는 공개된 prerelease에 있어야 합니다' }
    Checked { gh release download "resources-$env:U3_RESOURCE_VERSION" --repo smpbrighton/u3 --pattern $name --dir $archiveDir --clobber }
    $archive = Join-Path $archiveDir $name
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $env:U3_RESOURCE_SHA256) { throw '리소스 archive SHA-256 오류' }
    $entries = & tar -tf $archive
    if ($LASTEXITCODE -ne 0) { throw '리소스 archive 목록 오류' }
    foreach ($entry in $entries) {
        if ($entry -match '(^[/\\]|:|(^|[/\\])\.\.([/\\]|$))') { throw '리소스 archive 경로 오류' }
    }
    $env:U3_RESOURCE_ROOT = Join-Path $env:U3_BUILD_CACHE "resources-$env:U3_RESOURCE_VERSION"
    if (Test-Path $env:U3_RESOURCE_ROOT) { Remove-Item -Recurse -Force $env:U3_RESOURCE_ROOT }
    New-Item -ItemType Directory $env:U3_RESOURCE_ROOT | Out-Null
    Checked { tar -xzf $archive -C $env:U3_RESOURCE_ROOT }
    $resourceReady = $true
} elseif (-not $AllowNoResources) {
    throw '릴리스에는 U3_RESOURCE_VERSION과 U3_RESOURCE_SHA256 등록이 필요합니다'
}

if ($resourceReady) {
    New-Item -ItemType Directory -Force out | Out-Null
    $config = Join-Path (Get-Location) 'out/windows-ci.conf.json'
    # 정규화한 installer를 검증한 뒤 signer로 서명한다. PR에는 개인키를 제공하지 않는다.
    @{ bundle = @{ createUpdaterArtifacts = $false }; plugins = @{ updater = @{ pubkey = ($env:U3_WINDOWS_UPDATER_PUBLIC_KEY ?? '') } } } |
        ConvertTo-Json -Depth 8 | Set-Content -Encoding utf8 $config
    Checked { pnpm package --target x86_64-pc-windows-msvc --config $config }
} else {
    Checked { pnpm exec tsx scripts/build-engine.ts }
    Checked { bash scripts/build-whisper.sh }
}
$resources = Join-Path (Get-Location) 'src-tauri/resources'
$compositor = Join-Path $resources 'node_modules/@remotion/compositor-win32-x64-msvc'
$env:FFMPEG_BIN = Join-Path $compositor 'ffmpeg.exe'
$env:FFPROBE_BIN = Join-Path $compositor 'ffprobe.exe'
$env:PATH = "$compositor;$env:PATH"
$chrome = (Get-Content -Raw (Join-Path $resources 'chrome-path.txt')).Trim()
$env:U3_CHROME_EXECUTABLE = Join-Path $resources "chrome/$chrome"
$env:U3_REMOTION_BUNDLE = Join-Path $resources 'remotion-bundle'
$env:U3_FONT_DIR = Join-Path $resources 'assets/fonts'
if (-not $resourceReady) { $env:U3_FONT_DIR = Join-Path (Get-Location) 'assets/fonts' }
$env:U3_WINDOWS_RESOURCE_DIR = $resources
$env:U3_TEST_NODE = Join-Path $resources 'node.exe'
$env:U3_WINDOWS_NATIVE = if ($resourceReady) { '1' } else { '0' }
Checked { pnpm verify }
if (-not $resourceReady) {
    '리소스 archive가 없어 공통 verify만 실행했습니다. Windows package·native 시험은 미실행입니다.' | Add-Content $env:GITHUB_STEP_SUMMARY
    exit 0
}
Checked { cargo test --workspace --manifest-path src-tauri/Cargo.toml }
$bundles = Join-Path $env:CARGO_TARGET_DIR 'x86_64-pc-windows-msvc/release/bundle/nsis'
$installers = @(Get-ChildItem -LiteralPath $bundles -Filter '*.exe')
if ($installers.Count -ne 1) { throw 'NSIS installer가 하나가 아닙니다' }
$version = (Get-Content -Raw package.json | ConvertFrom-Json).version
$releaseDir = Join-Path (Get-Location) 'out/windows-release'
New-Item -ItemType Directory -Force $releaseDir | Out-Null
$installer = Join-Path $releaseDir "U3-$version-windows-x64-setup.exe"
Copy-Item -LiteralPath $installers[0].FullName -Destination $installer
Checked { pwsh -NoProfile -File scripts/windows-install-smoke.ps1 -Installer $installer }
"U3_WINDOWS_RELEASE_DIR=$releaseDir" | Add-Content $env:GITHUB_ENV
"U3_WINDOWS_SETUP_FILE=$installer" | Add-Content $env:GITHUB_ENV
