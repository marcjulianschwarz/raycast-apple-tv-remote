import { List, ActionPanel, Action, showToast, Toast, Icon, Color } from "@raycast/api";
import { executeATVCommand, getDefaultDevice } from "./utils";

interface RemoteButton {
  id: string;
  title: string;
  command: string;
  icon: Icon;
  color?: Color;
  section: string;
}

const remoteButtons: RemoteButton[] = [
  // Navigation
  { id: "up", title: "Up", command: "up", icon: Icon.ArrowUp, color: Color.Blue, section: "Navigation" },
  { id: "down", title: "Down", command: "down", icon: Icon.ArrowDown, color: Color.Blue, section: "Navigation" },
  { id: "left", title: "Left", command: "left", icon: Icon.ArrowLeft, color: Color.Blue, section: "Navigation" },
  { id: "right", title: "Right", command: "right", icon: Icon.ArrowRight, color: Color.Blue, section: "Navigation" },
  {
    id: "select",
    title: "Select",
    command: "select",
    icon: Icon.CheckCircle,
    color: Color.Green,
    section: "Navigation",
  },

  // Menu
  { id: "menu", title: "Menu", command: "menu", icon: Icon.List, color: Color.Purple, section: "Menu" },
  { id: "home", title: "Home", command: "home", icon: Icon.House, color: Color.Purple, section: "Menu" },
  { id: "home_hold", title: "TV", command: "home_hold", icon: Icon.AppWindow, color: Color.Purple, section: "Menu" },
  {
    id: "top_menu",
    title: "Top Menu",
    command: "top_menu",
    icon: Icon.ArrowUpCircle,
    color: Color.Purple,
    section: "Menu",
  },

  // Playback
  {
    id: "play_pause",
    title: "Play/Pause",
    command: "play_pause",
    icon: Icon.PlayFilled,
    color: Color.Green,
    section: "Playback",
  },
  { id: "next", title: "Next", command: "next", icon: Icon.Forward, color: Color.Blue, section: "Playback" },
  { id: "previous", title: "Previous", command: "previous", icon: Icon.Rewind, color: Color.Blue, section: "Playback" },

  // Volume
  {
    id: "volume_up",
    title: "Volume Up",
    command: "volume_up",
    icon: Icon.SpeakerOn,
    color: Color.Magenta,
    section: "Volume",
  },
  {
    id: "volume_down",
    title: "Volume Down",
    command: "volume_down",
    icon: Icon.SpeakerDown,
    color: Color.Magenta,
    section: "Volume",
  },
];

export default function ControlAppleTV() {
  // Fire-and-forget command sending - no async/await delays!
  function sendCommand(button: RemoteButton) {
    const defaultDevice = getDefaultDevice();

    defaultDevice.then((device) => {
      if (!device) {
        showToast({
          style: Toast.Style.Failure,
          title: "No default device",
          message: "Scan for devices first and set a default",
        });
        return;
      }

      // Send command instantly without waiting
      executeATVCommand(device, button.command).catch((error) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (!errorMsg.includes("superseded")) {
          showToast({
            style: Toast.Style.Failure,
            title: "Command failed",
            message: errorMsg,
          });
        }
      });
    });
  }

  // Group buttons by section
  const sections = Array.from(new Set(remoteButtons.map((b) => b.section)));

  return (
    <List searchBarPlaceholder="Search remote commands..." navigationTitle="Apple TV Remote">
      {sections.map((section) => (
        <List.Section key={section} title={section}>
          {remoteButtons
            .filter((button) => button.section === section)
            .map((button) => (
              <List.Item
                key={button.id}
                title={button.title}
                icon={{ source: button.icon, tintColor: button.color }}
                actions={
                  <ActionPanel>
                    <Action title={`Send ${button.title}`} icon={button.icon} onAction={() => sendCommand(button)} />
                  </ActionPanel>
                }
              />
            ))}
        </List.Section>
      ))}
    </List>
  );
}
