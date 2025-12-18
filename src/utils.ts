import { execSync } from "child_process";
import { showToast, Toast, LocalStorage, getPreferenceValues } from "@raycast/api";
import { sendWebSocketCommand } from "./websocket-client";

export interface AppleTVDevice {
  name: string;
  address: string;
  identifier: string;
}

interface Preferences {
  condaEnvironment?: string;
  condaPath?: string;
}

export function getCondaPrefix(): string {
  const preferences = getPreferenceValues<Preferences>();

  if (!preferences.condaEnvironment) {
    return "";
  }

  const condaCmd = preferences.condaPath || "conda";
  return `${condaCmd} run -n ${preferences.condaEnvironment} `;
}

export function getCondaBinPath(): string | null {
  const preferences = getPreferenceValues<Preferences>();

  if (!preferences.condaEnvironment) {
    return null;
  }

  try {
    const condaCmd = preferences.condaPath || "conda";
    // Get conda environment info to find the bin path
    const output = execSync(`${condaCmd} info --envs`, {
      encoding: "utf-8",
      timeout: 10000,
    });

    // Parse the output to find the environment path
    const lines = output.split("\n");
    for (const line of lines) {
      if (line.includes(preferences.condaEnvironment)) {
        // Format: "envname    *  /path/to/env" or "envname       /path/to/env"
        const parts = line.split(/\s+/);
        const envPath = parts[parts.length - 1];
        if (envPath && envPath.startsWith("/")) {
          return `${envPath}/bin`;
        }
      }
    }
  } catch (error) {
    console.error("Error getting conda bin path:", error);
  }

  return null;
}

export async function checkPyATVInstalled(): Promise<boolean> {
  try {
    // Try direct bin path first, fall back to conda run
    const condaBinPath = getCondaBinPath();
    const cmd = condaBinPath ? `test -f ${condaBinPath}/atvremote` : "which atvremote";

    execSync(cmd, {
      encoding: "utf-8",
      timeout: 10000,
      maxBuffer: 1024 * 1024 * 10,
    });
    return true;
  } catch (error: unknown) {
    const preferences = getPreferenceValues<Preferences>();
    const errorDetails = error instanceof Error ? error.message : String(error);

    // Check for Python 3.14 incompatibility
    if (errorDetails.includes("Pydantic V1 functionality isn't compatible with Python 3.14")) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Python version incompatible",
        message: "pyatv requires Python 3.11 or 3.12. Recreate your conda env with python=3.12",
      });
      return false;
    }

    const installMsg = preferences.condaEnvironment
      ? `conda activate ${preferences.condaEnvironment} && pip install pyatv`
      : "pip install pyatv";

    await showToast({
      style: Toast.Style.Failure,
      title: "pyatv not installed",
      message: `Install with: ${installMsg}`,
    });
    return false;
  }
}

export async function scanForDevices(): Promise<AppleTVDevice[]> {
  try {
    // Use direct bin path for better performance instead of conda run
    const condaBinPath = getCondaBinPath();
    const cmd = condaBinPath ? `${condaBinPath}/atvremote scan` : "atvremote scan";

    console.log("Executing scan command:", cmd);

    const output = execSync(cmd, {
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
      }
    }

    // Don't forget the last device
    if (currentDevice.name && currentDevice.address && currentDevice.identifier) {
      devices.push(currentDevice as AppleTVDevice);
    }

    console.log("Parsed devices:", devices);

    return devices;
  } catch (error: unknown) {
    console.error("Error scanning for devices:", error);
    const errorDetails = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : "";
    console.error("Error details:", errorDetails);
    console.error("Error stack:", errorStack);

    // Check for Python 3.14 incompatibility
    if (errorDetails.includes("Pydantic V1 functionality isn't compatible with Python 3.14")) {
      throw new Error(
        "Python 3.14+ is not compatible with pyatv. Please recreate your conda environment with Python 3.11 or 3.12:\nconda create -n pyatv-env python=3.12 && conda activate pyatv-env && pip install pyatv",
      );
    }

    throw new Error(`Failed to scan for Apple TV devices: ${errorDetails}`);
  }
}

// Map our commands to ATV Desktop Remote's command format
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
    // Map command to their format
    const mappedCommand = mapCommandName(command);

    // Fire-and-forget! Send command instantly without waiting
    console.log("Sending command via WebSocket:", mappedCommand);
    sendWebSocketCommand(mappedCommand);

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

export async function getDefaultDevice(): Promise<string | null> {
  return (await LocalStorage.getItem<string>("default_device")) || null;
}

export async function setDefaultDevice(deviceAddress: string): Promise<void> {
  await LocalStorage.setItem("default_device", deviceAddress);
}
