import { List, ActionPanel, Action, showToast, Toast, Icon, Color, showHUD } from "@raycast/api";
import { useState, useEffect } from "react";
import {
  scanForDevices,
  checkPyATVInstalled,
  setDefaultDevice,
  getStoredCredentials,
  storeCredentials,
  AppleTVDevice,
} from "./utils";
import { pairDevice } from "./pairing";

export default function ScanDevices() {
  const [devices, setDevices] = useState<AppleTVDevice[]>([]);
  const [pairedAddresses, setPairedAddresses] = useState<string[]>([]);
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

        const paired: string[] = [];
        for (const device of foundDevices) {
          if (await getStoredCredentials(device.address)) paired.push(device.address);
        }
        setPairedAddresses(paired);

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

  async function handlePair(device: AppleTVDevice) {
    setIsLoading(true);
    try {
      await showToast({
        style: Toast.Style.Animated,
        title: `Pairing with ${device.name}...`,
        message: "A PIN will appear on your TV screen",
      });

      const credentials = await pairDevice(device.address, "companion");
      if (!credentials?.companion) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Pairing failed",
          message: "No credentials received. Try again.",
        });
        return;
      }

      await storeCredentials(device.address, credentials.airplay, credentials.companion);
      await setDefaultDevice(device.address);
      setPairedAddresses((addresses) => [...addresses, device.address]);
      await showHUD(`Paired with ${device.name} and set as default device`);
    } finally {
      setIsLoading(false);
    }
  }

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
        devices.map((device) => {
          const isPaired = pairedAddresses.includes(device.address);
          return (
            <List.Item
              key={device.identifier}
              title={device.name}
              subtitle={device.address}
              accessories={[
                isPaired
                  ? { tag: { value: "Paired", color: Color.Green } }
                  : { tag: { value: "Not Paired", color: Color.SecondaryText } },
              ]}
              actions={
                <ActionPanel>
                  {isPaired ? (
                    <>
                      <Action title="Set as Default Device" icon={Icon.Star} onAction={() => handleSetDefault(device)} />
                      <Action title="Pair Again" icon={Icon.Link} onAction={() => handlePair(device)} />
                    </>
                  ) : (
                    <Action title="Pair and Set as Default" icon={Icon.Link} onAction={() => handlePair(device)} />
                  )}
                  <Action.CopyToClipboard
                    title="Copy Address"
                    content={device.address}
                    shortcut={{ modifiers: ["cmd"], key: "c" }}
                  />
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}
