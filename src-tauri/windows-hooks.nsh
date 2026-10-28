!define U3_VC_SCRIPT_SOURCE "${__FILEDIR__}\resources\bin\u3-install-vc-runtime.ps1"

!macro NSIS_HOOK_PREINSTALL
  InitPluginsDir
  File "/oname=$PLUGINSDIR\u3-vc-runtime.ps1" "${U3_VC_SCRIPT_SOURCE}"
  System::Call 'Kernel32::SetEnvironmentVariableW(w "U3_RUNTIME_SCRIPT", w "$PLUGINSDIR\u3-vc-runtime.ps1")'
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -Command "& ([scriptblock]::Create([IO.File]::ReadAllText($$env:U3_RUNTIME_SCRIPT)))"'
  Pop $0
  Pop $1
  System::Call 'Kernel32::SetEnvironmentVariableW(w "U3_RUNTIME_SCRIPT", p 0)'
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONSTOP "Microsoft Visual C++ runtime 설치를 완료하지 못했습니다. 인터넷 연결과 구성요소 설치 권한을 확인하세요." /SD IDOK
    SetErrorLevel 1
    Abort
  ${EndIf}
!macroend
