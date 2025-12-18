import { Grid, ActionPanel, Action, showToast, Toast, Icon, Color } from "@raycast/api";
import { executeATVCommand, getDefaultDevice } from "./utils";

interface RemoteButton {
  id: string;
  title: string;
  command: string;
  icon: Icon;
  color?: Color;
  shortcut?: { modifiers: string[]; key: string };
}

// Grid layout: 7 columns, centered 3-column remote
const gridButtons: (RemoteButton | null)[][] = [
  // Row 1: Volume Down, Up, Volume Up (centered)
  [
    null,
    null,
    {
      id: "volume_down",
      title: "Vol -",
      command: "volume_down",
      icon: Icon.SpeakerDown,
      color: Color.Magenta,
      shortcut: { modifiers: ["cmd", "shift"], key: "-" },
    },
    {
      id: "up",
      title: "Up",
      command: "up",
      icon: Icon.ArrowUp,
      color: Color.Blue,
      shortcut: { modifiers: ["cmd", "shift"], key: "arrowUp" },
    },
    {
      id: "volume_up",
      title: "Vol +",
      command: "volume_up",
      icon: Icon.SpeakerOn,
      color: Color.Magenta,
      shortcut: { modifiers: ["cmd", "shift"], key: "+" },
    },
    null,
    null,
  ],
  // Row 2: Left, Select, Right (centered) - Select is at x=3 (0-indexed)
  [
    null,
    null,
    {
      id: "left",
      title: "Left",
      command: "left",
      icon: Icon.ArrowLeft,
      color: Color.Blue,
      shortcut: { modifiers: ["cmd", "shift"], key: "arrowLeft" },
    },
    {
      id: "select",
      title: "Select",
      command: "select",
      icon: Icon.CheckCircle,
      color: Color.Green,
      shortcut: { modifiers: ["cmd", "shift"], key: "return" },
    },
    {
      id: "right",
      title: "Right",
      command: "right",
      icon: Icon.ArrowRight,
      color: Color.Blue,
      shortcut: { modifiers: ["cmd", "shift"], key: "arrowRight" },
    },
    null,
    null,
  ],
  // Row 3: Prev, Down, Next (centered)
  [
    null,
    null,
    { id: "previous", title: "Prev", command: "previous", icon: Icon.Rewind, color: Color.Blue },
    {
      id: "down",
      title: "Down",
      command: "down",
      icon: Icon.ArrowDown,
      color: Color.Blue,
      shortcut: { modifiers: ["cmd", "shift"], key: "arrowDown" },
    },
    { id: "next", title: "Next", command: "next", icon: Icon.Forward, color: Color.Blue },
    null,
    null,
  ],
  // Row 4: Play, Menu, TV (centered)
  [
    null,
    null,
    { id: "play_pause", title: "Play", command: "play_pause", icon: Icon.PlayFilled, color: Color.Green },
    { id: "menu", title: "Menu", command: "menu", icon: Icon.List, color: Color.Purple },
    { id: "home_hold", title: "TV", command: "home_hold", icon: Icon.AppWindow, color: Color.Purple },
    null,
    null,
  ],
];

export default function GridRemote() {
  function sendCommand(command: string) {
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

      executeATVCommand(device, command).catch((error) => {
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

  function RemoteActions({ button }: { button?: RemoteButton }) {
    return (
      <ActionPanel>
        {button && (
          <Action
            title={`Send ${button.title}`}
            icon={button.icon}
            onAction={() => sendCommand(button.command)}
            shortcut={button.shortcut}
          />
        )}
        <Action
          title="Menu"
          icon={Icon.List}
          onAction={() => sendCommand("menu")}
          shortcut={{ modifiers: ["cmd"], key: "return" }}
        />
        <Action
          title="Up"
          icon={Icon.ArrowUp}
          onAction={() => sendCommand("up")}
          shortcut={{ modifiers: ["cmd", "shift"], key: "arrowUp" }}
        />
        <Action
          title="Down"
          icon={Icon.ArrowDown}
          onAction={() => sendCommand("down")}
          shortcut={{ modifiers: ["cmd", "shift"], key: "arrowDown" }}
        />
        <Action
          title="Left"
          icon={Icon.ArrowLeft}
          onAction={() => sendCommand("left")}
          shortcut={{ modifiers: ["cmd", "shift"], key: "arrowLeft" }}
        />
        <Action
          title="Right"
          icon={Icon.ArrowRight}
          onAction={() => sendCommand("right")}
          shortcut={{ modifiers: ["cmd", "shift"], key: "arrowRight" }}
        />
        <Action
          title="Select"
          icon={Icon.CheckCircle}
          onAction={() => sendCommand("select")}
          shortcut={{ modifiers: ["cmd", "shift"], key: "return" }}
        />
        <Action
          title="Volume Up"
          icon={Icon.SpeakerOn}
          onAction={() => sendCommand("volume_up")}
          shortcut={{ modifiers: ["cmd", "shift"], key: "+" }}
        />
        <Action
          title="Volume Down"
          icon={Icon.SpeakerDown}
          onAction={() => sendCommand("volume_down")}
          shortcut={{ modifiers: ["cmd", "shift"], key: "-" }}
        />
      </ActionPanel>
    );
  }

  return (
    <Grid columns={7} navigationTitle="Apple TV Remote" itemSize={Grid.ItemSize.Small} selectedItemId="select">
      {gridButtons.flat().map((button, index) => {
        if (!button) {
          return <Grid.Item key={`empty-${index}`} content={{ value: "" }} title="" actions={<RemoteActions />} />;
        }

        return (
          <Grid.Item
            key={button.id}
            id={button.id}
            content={{ source: button.icon, tintColor: button.color }}
            title={button.title}
            actions={<RemoteActions button={button} />}
          />
        );
      })}
    </Grid>
  );
}
