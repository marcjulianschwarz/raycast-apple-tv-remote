import { List, ActionPanel, Action, showToast, Toast, Icon, launchCommand, LaunchType } from "@raycast/api";
import { useState, useEffect } from "react";
import { execFile } from "child_process";
import { promisify } from "util";
import { checkPyATVInstalled, getDefaultDevice, getStoredCredentials } from "./utils";
import { atvremotePath } from "./python-env";

const execFileAsync = promisify(execFile);

interface PlayingInfo {
  title?: string;
  artist?: string;
  album?: string;
  deviceState?: string;
  position?: string;
  totalTime?: string;
}

export default function NowPlaying() {
  const [info, setInfo] = useState<PlayingInfo>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchNowPlaying() {
      const installed = await checkPyATVInstalled();
      if (!installed) {
        setIsLoading(false);
        return;
      }

      const defaultDevice = await getDefaultDevice();
      if (!defaultDevice) {
        await launchCommand({ name: "scan-devices", type: LaunchType.UserInitiated });
        return;
      }

      try {
        const credentials = await getStoredCredentials(defaultDevice);
        const args = ["-s", defaultDevice];
        if (credentials?.companion) args.push("--companion-credentials", credentials.companion);
        if (credentials?.airplay) args.push("--airplay-credentials", credentials.airplay);
        const { stdout: output } = await execFileAsync(atvremotePath, [...args, "playing"], {
          encoding: "utf-8",
          timeout: 30000,
        });
        const parsedInfo = parsePlayingInfo(output);
        setInfo(parsedInfo);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to get info",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchNowPlaying();
  }, []);

  function parsePlayingInfo(output: string): PlayingInfo {
    const info: PlayingInfo = {};
    const lines = output.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.includes("Title:")) {
        info.title = trimmed.split("Title:")[1]?.trim();
      } else if (trimmed.includes("Artist:")) {
        info.artist = trimmed.split("Artist:")[1]?.trim();
      } else if (trimmed.includes("Album:")) {
        info.album = trimmed.split("Album:")[1]?.trim();
      } else if (trimmed.includes("Device state:")) {
        info.deviceState = trimmed.split("Device state:")[1]?.trim();
      } else if (trimmed.includes("Position:")) {
        info.position = trimmed.split("Position:")[1]?.trim();
      } else if (trimmed.includes("Total time:")) {
        info.totalTime = trimmed.split("Total time:")[1]?.trim();
      }
    }

    return info;
  }

  const hasInfo = info.title || info.deviceState;

  return (
    <List isLoading={isLoading}>
      {hasInfo ? (
        <>
          {info.title && (
            <List.Item
              title="Title"
              subtitle={info.title}
              icon={Icon.Music}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard content={info.title} />
                </ActionPanel>
              }
            />
          )}
          {info.artist && (
            <List.Item
              title="Artist"
              subtitle={info.artist}
              icon={Icon.Person}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard content={info.artist} />
                </ActionPanel>
              }
            />
          )}
          {info.album && (
            <List.Item
              title="Album"
              subtitle={info.album}
              icon={Icon.AppWindow}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard content={info.album} />
                </ActionPanel>
              }
            />
          )}
          {info.deviceState && (
            <List.Item
              title="Device State"
              subtitle={info.deviceState}
              icon={Icon.CircleProgress}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard content={info.deviceState} />
                </ActionPanel>
              }
            />
          )}
          {info.position && (
            <List.Item
              title="Position"
              subtitle={info.position}
              icon={Icon.Clock}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard content={info.position} />
                </ActionPanel>
              }
            />
          )}
          {info.totalTime && (
            <List.Item
              title="Total Time"
              subtitle={info.totalTime}
              icon={Icon.Hourglass}
              actions={
                <ActionPanel>
                  <Action.CopyToClipboard content={info.totalTime} />
                </ActionPanel>
              }
            />
          )}
        </>
      ) : (
        <List.EmptyView
          title="No playback information"
          description="Nothing is currently playing on your Apple TV"
          icon={Icon.Music}
        />
      )}
    </List>
  );
}
