import { showToast, Toast, showHUD, launchCommand, LaunchType } from "@raycast/api";
import { executeATVCommand, getDefaultDevice } from "./utils";

export default async function TurnOnAppleTV() {
  try {
    const defaultDevice = await getDefaultDevice();

    if (!defaultDevice) {
      await launchCommand({ name: "scan-devices", type: LaunchType.UserInitiated });
      return;
    }

    await executeATVCommand(defaultDevice, "home");
    await showHUD("Apple TV turned on");
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Failed to turn on Apple TV",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
