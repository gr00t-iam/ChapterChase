$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$readerSpeech = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $readerText = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:CHAPTERCHASE_SPEECH_TEXT))
  $readerPrompt = $readerSpeech.SpeakAsync($readerText)
  $readerPreviousCommand = ''
  while (-not $readerPrompt.IsCompleted) {
    if ($env:CHAPTERCHASE_SPEECH_CONTROL -and (Test-Path -LiteralPath $env:CHAPTERCHASE_SPEECH_CONTROL)) {
      $readerCommand = [IO.File]::ReadAllText($env:CHAPTERCHASE_SPEECH_CONTROL)
      if ($readerCommand -ne $readerPreviousCommand) {
      switch ($readerCommand) {
        'pause' { $readerSpeech.Pause() }
        'resume' { $readerSpeech.Resume() }
        'stop' { $readerSpeech.SpeakAsyncCancelAll() }
      }
      $readerPreviousCommand = $readerCommand
      if ($readerCommand -eq 'stop') { break }
      }
    }
    Start-Sleep -Milliseconds 25
  }
  if ($readerPrompt.Exception) { throw $readerPrompt.Exception }
} finally {
  $readerSpeech.Dispose()
}
