# NSIS가 이 파일을 설치 프로그램에 포함한다. 내려받은 실행 파일만 Microsoft에서 공급한다.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$temporary = $null
try {
    $registry = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryView]::Registry64)
    $key = $registry.OpenSubKey('SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64')
    if ($key -and $key.GetValue('Installed') -eq 1) {
        $version = [version]($key.GetValue('Version').TrimStart('v'))
        if ($version -ge [version]'14.44.35211.0') { exit 0 }
    }
    $temporary = Join-Path $env:TEMP ('u3-vc-' + [guid]::NewGuid().ToString() + '.exe')
    $url = 'https://download.visualstudio.microsoft.com/download/pr/990c720a-46ce-4dc7-87b9-c2eb615d34b9/CC0FF0EB1DC3F5188AE6300FAEF32BF5BEEBA4BDD6E8E445A9184072096B713B/VC_redist.x64.exe'
    Invoke-WebRequest -Uri $url -OutFile $temporary -UseBasicParsing
    if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'cc0ff0eb1dc3f5188ae6300faef32bf5beeba4bdd6e8e445a9184072096b713b') { throw 'hash' }
    $signature = Get-AuthenticodeSignature -FilePath $temporary
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|,\s*)O=Microsoft Corporation(,|$)') { throw 'signature' }
    $installed = Start-Process -FilePath $temporary -ArgumentList '/install /quiet /norestart' -Verb RunAs -Wait -PassThru -WindowStyle Hidden
    if ($installed.ExitCode -notin @(0, 3010)) { throw 'install' }
    exit 0
} catch {
    Write-Output 'Microsoft Visual C++ runtime을 설치하지 못했습니다. 인터넷 연결과 구성요소 설치 권한을 확인하세요.'
    exit 1
} finally {
    if ($temporary) { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }
}
