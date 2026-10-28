param([Parameter(Mandatory = $true)][string]$Installer)
$ErrorActionPreference = 'Stop'
if ($env:CI -ne 'true' -or -not $env:RUNNER_TEMP) { throw '이 설치 시험은 깨끗한 CI runner에서 실행하세요' }
$root = Join-Path $env:RUNNER_TEMP ('u3 설치 시험 ' + [guid]::NewGuid().ToString())
$installDir = Join-Path $root '설치 폴더'
$dataDir = Join-Path $root '사용자 데이터'
$engine = $null
$engineStarted = $false
$uninstalled = $false
New-Item -ItemType Directory -Force $root | Out-Null
try {
    # NSIS /D는 마지막 인자이며 경로 전체를 따옴표로 감싸지 않는다.
    $installed = Start-Process -FilePath $Installer -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
    if ($installed.ExitCode -ne 0) { throw "NSIS 설치 실패: $($installed.ExitCode)" }
    if (-not (Test-Path (Join-Path $installDir 'u3.exe'))) { throw '설치된 앱 실행 파일이 없습니다' }
    $resources = Join-Path $installDir 'resources'
    $compositor = Join-Path $resources 'node_modules/@remotion/compositor-win32-x64-msvc'
    & bash scripts/check-engine-key.sh $installDir
    if ($LASTEXITCODE -ne 0) { throw '설치본 키 검사 실패' }
    $token = [guid]::NewGuid().ToString()
    $info = [Diagnostics.ProcessStartInfo]::new()
    $info.FileName = Join-Path $resources 'node.exe'
    $info.ArgumentList.Add((Join-Path $resources 'engine.mjs'))
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    $values = @{
        U3_TOKEN=$token; U3_DATA_DIR=$dataDir; TAURI_ORIGIN='http://tauri.localhost'
        U3_RESOURCE_DIR=$resources; U3_LIBRARY_DIR=(Join-Path $resources 'library')
        U3_FONT_DIR=(Join-Path $resources 'assets/fonts')
        U3_MRX_MODEL=(Join-Path $resources 'models/mrx.int8.onnx')
        U3_WHISPER_CLI=(Join-Path $resources 'bin/whisper-cli.exe')
        U3_KEY_STORE_CLI=(Join-Path $resources 'bin/u3-key-store.exe')
        U3_SILERO_MODEL=(Join-Path $resources 'models/ggml-silero-v6.2.0.bin')
        FFMPEG_BIN=(Join-Path $compositor 'ffmpeg.exe'); FFPROBE_BIN=(Join-Path $compositor 'ffprobe.exe')
        U3_REMOTION_BUNDLE=(Join-Path $resources 'remotion-bundle')
        U3_CHROME_EXECUTABLE=(Join-Path $resources ('chrome/' + (Get-Content -Raw (Join-Path $resources 'chrome-path.txt')).Trim()))
    }
    foreach ($entry in $values.GetEnumerator()) { $info.Environment[$entry.Key] = $entry.Value }
    $engine = [Diagnostics.Process]::new()
    $engine.StartInfo = $info
    if (-not $engine.Start()) { throw '설치된 Node를 시작하지 못했습니다' }
    $engineStarted = $true
    $errorOutput = $engine.StandardError.ReadToEndAsync()
    $lineTask = $engine.StandardOutput.ReadLineAsync()
    if (-not $lineTask.Wait(30000)) { throw '설치된 엔진의 PORT 응답 시간 초과' }
    $line = $lineTask.Result
    if ($line -notmatch '^PORT ([0-9]+)$') { throw '설치된 엔진의 PORT 응답 오류' }
    $base = 'http://127.0.0.1:' + $Matches[1]
    $headers = @{ Authorization="Bearer $token"; Origin='http://tauri.localhost' }
    $health = Invoke-RestMethod -Uri "$base/api/health" -Headers $headers -TimeoutSec 30
    if (-not $health.ok) { throw '설치된 엔진 health 오류' }
    $body = @{ name='한글 저장 확인' } | ConvertTo-Json
    $project = Invoke-RestMethod -Method Post -Uri "$base/api/projects" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 30
    $project.name = '다시 연 프로젝트'
    $saved = Invoke-RestMethod -Method Put -Uri "$base/api/projects/$($project.id)" -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($project | ConvertTo-Json -Depth 30))) -TimeoutSec 30
    $reopened = Invoke-RestMethod -Uri "$base/api/projects/$($project.id)" -Headers $headers -TimeoutSec 30
    if ($reopened.name -ne $saved.name) { throw '설치된 엔진 저장·재열기 오류' }
    $projectFile = Join-Path $dataDir "projects/$($project.id)/project.json"
    if (-not (Test-Path $projectFile)) { throw '프로젝트 파일을 쓰지 않았습니다' }
    $engine.StandardInput.Close()
    if (-not $engine.WaitForExit(6000)) { throw '설치된 엔진 종료 시간 초과' }
    if ($engine.ExitCode -ne 0) { throw "설치된 엔진 종료 코드 오류: $($engine.ExitCode)" }
    # Node와 자식이 실행 파일을 잠그고 있으면 디렉터리 이동이 실패한다.
    Move-Item -LiteralPath $resources -Destination "$resources-closed"
    Move-Item -LiteralPath "$resources-closed" -Destination $resources
    $uninstallers = @(Get-ChildItem -LiteralPath $installDir -Filter '*uninstall*.exe' -File)
    if ($uninstallers.Count -ne 1) { throw '제거 프로그램이 하나가 아닙니다' }
    $removed = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -Wait -PassThru
    if ($removed.ExitCode -ne 0) { throw "제거 실패: $($removed.ExitCode)" }
    if (Test-Path (Join-Path $installDir 'u3.exe')) { throw '제거 뒤 앱 실행 파일이 남았습니다' }
    if (-not (Test-Path $projectFile)) { throw '제거가 프로젝트를 삭제했습니다' }
    $uninstalled = $true
    Write-Output '✓ Windows 설치 smoke passed'
} finally {
    if ($engineStarted -and -not $engine.HasExited) { $engine.Kill($true); $engine.WaitForExit() }
    if ($engine) { $engine.Dispose() }
    if ($uninstalled) { Remove-Item -LiteralPath $root -Recurse -Force }
}
