import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { HostMedia, PlaybackStatus } from "@pryladova/shared";

const execFileAsync = promisify(execFile);

const SMTC_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
$manager = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$session = $manager.GetCurrentSession()
if ($null -eq $session) {
  Write-Output '{"media":null}'
  exit 0
}
$info = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
$status = $session.GetPlaybackInfo().PlaybackStatus.ToString()
$payload = [ordered]@{
  title = $info.Title
  artist = $info.Artist
  albumTitle = $info.AlbumTitle
  appName = $session.SourceAppUserModelId
  playbackStatus = $status
}
($payload | ConvertTo-Json -Compress)
`;

type SmtcRaw = {
  title?: unknown;
  artist?: unknown;
  albumTitle?: unknown;
  appName?: unknown;
  playbackStatus?: unknown;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const mapPlaybackStatus = (value: unknown): PlaybackStatus => {
  if (typeof value !== "string") {
    return "unknown";
  }
  switch (value.toLowerCase()) {
    case "playing":
      return "playing";
    case "paused":
      return "paused";
    case "stopped":
      return "stopped";
    default:
      return "unknown";
  }
};

export const readNowPlaying = async (): Promise<HostMedia | null> => {
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", SMTC_SCRIPT],
      {
        windowsHide: true,
        timeout: 5000,
        maxBuffer: 1024 * 64,
        encoding: "utf8",
      },
    );

    const trimmed = stdout.trim();
    if (!trimmed || trimmed === '{"media":null}') {
      return null;
    }

    const parsed: unknown = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== "object") {
      return null;
    }

    const raw = parsed as SmtcRaw;
    const title = asNonEmptyString(raw.title);
    if (!title) {
      return null;
    }

    return {
      title,
      artist: asNonEmptyString(raw.artist),
      albumTitle: asNonEmptyString(raw.albumTitle),
      appName: asNonEmptyString(raw.appName),
      playbackStatus: mapPlaybackStatus(raw.playbackStatus),
    };
  } catch {
    return null;
  }
};
