import { List, ActionPanel, Action, showToast, Toast, Icon } from "@raycast/api";
import { useState, useEffect } from "react";
import { scanForDevices, checkPyATVInstalled, setDefaultDevice, AppleTVDevice } from "./utils";

export default function ScanDevices() {
  const [devices, setDevices] = useState<AppleTVDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function scan() {
      const installed = await checkPyATVInstalled();
      if (!installed) {
        setIsLoading(false);
        return;
      }

      try {
        await showToast({
          style: Toast.Style.Animated,
          title: "Scanning for Apple TV devices...",
        });

        const foundDevices = await scanForDevices();
        setDevices(foundDevices);

        await showToast({
          style: Toast.Style.Success,
          title: `Found ${foundDevices.length} device(s)`,
        });
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Scan failed",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }

    scan();
  }, []);

  async function handleSetDefault(device: AppleTVDevice) {
    await setDefaultDevice(device.address);
    await showToast({
      style: Toast.Style.Success,
      title: "Default device set",
      message: device.name,
    });
  }

  return (
    <List isLoading={isLoading}>
      {devices.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No Apple TV devices found"
          description="Make sure your Apple TV is on the same network"
          icon={Icon.Wifi}
        />
      ) : (
        devices.map((device) => (
          <List.Item
            key={device.identifier}
            title={device.name}
            subtitle={device.address}
            accessories={[{ text: device.identifier }]}
            actions={
              <ActionPanel>
                <Action title="Set as Default Device" icon={Icon.Star} onAction={() => handleSetDefault(device)} />
                <Action.CopyToClipboard
                  title="Copy Address"
                  content={device.address}
                  shortcut={{ modifiers: ["cmd"], key: "c" }}
                />
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
