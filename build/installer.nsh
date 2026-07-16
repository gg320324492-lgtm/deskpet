; electron-builder's default running-app check uses WMI/PowerShell.  Some
; locked-down Windows installations can detect DateNightGirl through WMI but
; cannot terminate it, which aborts an otherwise valid upgrade.  Use the
; bundled nsProcess plug-in instead and keep the same user-facing behaviour.
!macro customCheckAppRunning
  ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0

  ${if} $R0 == 0
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK close_running_app
    Quit

    close_running_app:
      DetailPrint "$(appClosing)"

      ; Ask the app to close first. DateNightGirl normally hides to the tray,
      ; so fall back to terminating the exact executable when it remains.
      ${nsProcess::CloseProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      Sleep 1200
      ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0

      ${if} $R0 == 0
        ; nsProcess cannot reliably terminate 64-bit Electron processes on all
        ; Windows builds. taskkill is the final, exact-image-name fallback.
        nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
        Pop $R1
        Sleep 800
        ${nsProcess::FindProcess} "${APP_EXECUTABLE_FILENAME}" $R0
      ${endif}

      ${if} $R0 == 0
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY close_running_app
        Quit
      ${endif}
  ${endif}

  ${nsProcess::Unload}
!macroend

; electron-builder preserves a deliberately deleted Start Menu shortcut during
; upgrades.  DateNightGirl's older installers never created that shortcut, so
; always repair it after installing the application files.
!macro customInstall
  !insertmacro createMenuDirectory
  CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
  ClearErrors
  WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"

  ; A child process launched from a packaged desktop host can receive a
  ; virtualized $SMPROGRAMS path. Repair the physical per-user Start Menu too.
  ${if} $installMode == "CurrentUser"
    CreateDirectory "$PROFILE\AppData\Roaming\Microsoft\Windows\Start Menu\Programs"
    StrCpy $R9 "$PROFILE\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\${SHORTCUT_NAME}.lnk"
    CreateShortCut "$R9" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$R9" "${APP_ID}"
  ${endif}
!macroend
