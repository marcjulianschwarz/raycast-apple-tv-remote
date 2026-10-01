import { execFile } from "child_process";
import { promisify } from "util";
import { showToast, Toast, LocalStorage } from "@raycast/api";
import { sendWebSocketCommand } from "./websocket-client";
import { atvremotePath, installPyATV } from "./python-env";

const execFileAsync = promisify(execFile);

export interface AppleTVDevice {
  name: string;
  address: string;
  identifier: string;
  model: string;
}

export async function checkPyATVInstalled(): Promise<boolean> {
  try {
    await installPyATV();
    return true;
  } catch (error: unknown) {
    console.error("Error installing pyatv:", error);
    await showToast({
      style: Toast.Style.Failure,
      title: "pyatv setup failed",
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function scanForDevices(): Promise<AppleTVDevice[]> {
  try {
    console.log("Executing scan command:", atvremotePath, "scan");

    const { stdout: output } = await execFileAsync(atvremotePath, ["scan"], {
      encoding: "utf-8",
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10,
    });

    console.log("Scan output:", output);

    const devices: AppleTVDevice[] = [];
    const lines = output.split("\n");

    let currentDevice: Partial<AppleTVDevice> = {};
    let inIdentifiersSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check if we're entering the Identifiers section
      if (trimmed === "Identifiers:") {
        inIdentifiersSection = true;
        continue;
      }

      // Check if we're leaving the Identifiers section (next field starts)
      if (inIdentifiersSection && trimmed.match(/^[A-Z][a-z]+:/)) {
        inIdentifiersSection = false;
      }

      // Parse identifier from the list (format: " - 678EC963-3BE4-4A2E-B387-160EA295DC0E")
      if (inIdentifiersSection && trimmed.startsWith("- ") && !currentDevice.identifier) {
        currentDevice.identifier = trimmed.substring(2).trim();
        continue;
      }

      // Start of a new device (Name field)
      if (trimmed.startsWith("Name:")) {
        // Save previous device if complete
        if (currentDevice.name && currentDevice.address && currentDevice.identifier) {
          devices.push(currentDevice as AppleTVDevice);
        }
        currentDevice = { name: trimmed.substring(5).trim() };
      } else if (trimmed.startsWith("Address:")) {
        currentDevice.address = trimmed.substring(8).trim();
      } else if (trimmed.startsWith("Model/SW:")) {
        currentDevice.model = trimmed.substring(9).trim();
      }
    }

    // Don't forget the last device
    if (currentDevice.name && currentDevice.address && currentDevice.identifier) {
      devices.push(currentDevice as AppleTVDevice);
    }

    console.log("Parsed devices:", devices);

    // Scan also finds HomePods, Macs and other AirPlay receivers that cannot be controlled
    return devices.filter((device) => device.model?.startsWith("Apple TV"));
  } catch (error: unknown) {
    console.error("Error scanning for devices:", error);
    const errorDetails = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("Error details:", errorDetails);
    console.error("Error stack:", errorStack);

    throw new Error(`Failed to scan for Apple TV devices: ${errorDetails}`);
  }
}

// Map our commands to the ATV server's key names
function mapCommandName(command: string): string {
  const commandMap: Record<string, string> = {
    // Playback mappings
    next: "skip_forward",
    previous: "skip_backward",
    // Everything else maps directly
  };

  return commandMap[command] || command;
}

export async function executeATVCommand(deviceAddress: string, command: string): Promise<string> {
  try {
    await installPyATV();
    const credentials = await getStoredCredentials(deviceAddress);

    // Map command to their format
    const mappedCommand = mapCommandName(command);

    // Fire-and-forget! Send command instantly without waiting
    console.log("Sending command via WebSocket:", mappedCommand);
    sendWebSocketCommand(
      { address: deviceAddress, companion: credentials?.companion ?? "", airplay: credentials?.airplay ?? "" },
      mappedCommand,
    );

    // Return immediately for instant feel
    return JSON.stringify({ status: "sent", command: mappedCommand });
  } catch (error: unknown) {
    console.error("Error executing command:", error);
    const errorDetails = error instanceof Error ? error.message : String(error);
    console.error("Error details:", errorDetails);

    throw new Error(`Failed to execute command: ${errorDetails}`);
  }
}

interface StoredCredentials {
  airplay?: string;
  companion?: string;
}

export async function getStoredCredentials(deviceAddress: string): Promise<StoredCredentials | null> {
  const stored = await LocalStorage.getItem<string>(`credentials_${deviceAddress}`);
  if (stored) {
    const creds = JSON.parse(stored);
    console.log(`Retrieved credentials for ${deviceAddress}:`, {
      hasAirplay: !!creds.airplay,
      hasCompanion: !!creds.companion,
    });
    return creds;
  }
  console.log(`No stored credentials found for ${deviceAddress}`);
  return null;
}

export async function storeCredentials(deviceAddress: string, airplay?: string, companion?: string): Promise<void> {
  const credentials: StoredCredentials = {};
  if (airplay) credentials.airplay = airplay;
  if (companion) credentials.companion = companion;

  console.log(`Storing credentials for ${deviceAddress}:`, {
    hasAirplay: !!airplay,
    hasCompanion: !!companion,
    airplayLength: airplay?.length,
    companionLength: companion?.length,
  });

  await LocalStorage.setItem(`credentials_${deviceAddress}`, JSON.stringify(credentials));
}

// Only a paired default device counts, so unpaired devices go through setup
export async function getDefaultDevice(): Promise<string | null> {
  const address = await LocalStorage.getItem<string>("default_device");
  if (!address || !(await getStoredCredentials(address))) {
    return null;
  }
  return address;
}

export async function setDefaultDevice(deviceAddress: string): Promise<void> {
  await LocalStorage.setItem("default_device", deviceAddress);
}
