import { List, ActionPanel, Action, showToast, Toast, Icon, Color } from "@raycast/api";
import { executeATVCommand, getDefaultDevice } from "./utils";

interface VolumeButton {
  id: string;
  title: string;
  command: string;
  icon: Icon;
  color: Color;
}

const volumeButtons: VolumeButton[] = [
  {
    id: "volume_up",
    title: "Volume Up",
    command: "volume_up",
    icon: Icon.SpeakerOn,
    color: Color.Magenta,
  },
  {
    id: "volume_down",
    title: "Volume Down",
    command: "volume_down",
    icon: Icon.SpeakerDown,
    color: Color.Magenta,
  },
];

export default function VolumeControl() {
  function sendCommand(button: VolumeButton) {
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

  return (
    <List searchBarPlaceholder="Search volume commands..." navigationTitle="Volume Control">
      {volumeButtons.map((button) => (
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
    </List>
  );
}
