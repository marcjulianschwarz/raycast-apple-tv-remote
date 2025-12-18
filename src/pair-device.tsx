import { Form, ActionPanel, Action, showToast, Toast, showHUD } from "@raycast/api";
import { useState } from "react";
import { exec, spawn } from "child_process";
import { checkPyATVInstalled, storeCredentials, getCondaBinPath, setDefaultDevice } from "./utils";

interface PairFormValues {
  deviceAddress: string;
  protocol: string;
}

export default function PairDevice() {
  const [isLoading, setIsLoading] = useState(false);

  async function pairWithProtocol(
    deviceAddress: string,
    protocol: string,
  ): Promise<{ airplay?: string; companion?: string } | null> {
    return new Promise((resolve) => {
      // Get conda bin path for direct execution (avoids conda run stdin issues)
      const condaBinPath = getCondaBinPath();
      const command = condaBinPath ? `${condaBinPath}/atvremote` : "atvremote";
      const args = ["-s", deviceAddress, "--protocol", protocol, "pair"];

      console.log("Spawning command:", command, args);

      const proc = spawn(command, args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";
      let pinRequested = false;

      proc.stdout?.on("data", async (data) => {
        const text = data.toString();
        output += text;
        console.log("stdout:", text);

        if (text.includes("Enter PIN on screen") && !pinRequested) {
          pinRequested = true;
          await showToast({
            style: Toast.Style.Animated,
            title: "PIN Required",
            message: "Check your TV screen for a 4-digit code",
          });

          // Give the toast time to show
          setTimeout(async () => {
            // Prompt user for PIN using native macOS dialog
            const pin = await new Promise<string>((resolvePIN) => {
              exec(
                'osascript -e \'display dialog "Enter the 4-digit PIN shown on your Apple TV screen:" default answer "" with title "Apple TV Pairing" giving up after 30\'',
                (error: Error | null, stdout: string) => {
                  if (error) {
                    console.error("Error showing PIN dialog:", error);
                    resolvePIN("");
                    return;
                  }
                  const match = stdout.match(/text returned:(.+?)(,|$)/);
                  const pinValue = match ? match[1].trim() : "";
                  console.log("PIN entered:", pinValue ? "****" : "(empty)");
                  resolvePIN(pinValue);
                },
              );
            });

            if (pin && proc.stdin) {
              console.log("Sending PIN to process");
              proc.stdin.write(pin + "\n");
              // Don't close stdin immediately, let the process finish
            } else {
              console.log("No PIN entered, killing process");
              proc.kill();
              resolve(null);
            }
          }, 100);
        }
      });

      proc.stderr?.on("data", (data) => {
        const text = data.toString();
        errorOutput += text;
        console.error("stderr:", text);
      });

      proc.on("close", async (code) => {
        console.log(`Process exited with code ${code}`);
        console.log("Full output:", output);
        console.log("Full error:", errorOutput);

        if (code === 0 || output.includes("credentials")) {
          // Try old format first
          let airplayMatch = output.match(/AirPlay credentials:\s*([^\s]+)/);
          let companionMatch = output.match(/Companion credentials:\s*([^\s]+)/);

          // Try new format: "You may now use these credentials: XXXX"
          if (!airplayMatch && !companionMatch) {
            const genericMatch = output.match(/You may now use these credentials:\s*([^\s]+)/);
            if (genericMatch && protocol === "companion") {
              companionMatch = genericMatch;
            } else if (genericMatch && protocol === "airplay") {
              airplayMatch = genericMatch;
            }
          }

          if (airplayMatch || companionMatch) {
            resolve({
              airplay: airplayMatch?.[1],
              companion: companionMatch?.[1],
            });
          } else {
            resolve(null);
          }
        } else {
          // Check for specific error types
          if (errorOutput.includes("Authentication") || output.includes("AuthenticationError")) {
            await showToast({
              style: Toast.Style.Failure,
              title: "Authentication failed",
              message: "Wrong PIN or pairing timed out. Try again.",
            });
          } else if (errorOutput.includes("BackOff")) {
            await showToast({
              style: Toast.Style.Failure,
              title: "Too many attempts",
              message: "Wait a moment before trying again",
            });
          }
          resolve(null);
        }
      });
    });
  }

  async function handleSubmit(values: PairFormValues) {
    const installed = await checkPyATVInstalled();
    if (!installed) return;

    if (!values.deviceAddress) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Device address required",
      });
      return;
    }

    setIsLoading(true);

    try {
      await showToast({
        style: Toast.Style.Animated,
        title: "Starting pairing process...",
      });

      const protocols = values.protocol === "all" ? ["companion", "airplay"] : [values.protocol];

      let airplayCredentials: string | undefined;
      let companionCredentials: string | undefined;

      for (const protocol of protocols) {
        await showToast({
          style: Toast.Style.Animated,
          title: `Pairing ${protocol}...`,
          message: "A PIN will appear on your TV screen",
        });

        try {
          const result = await pairWithProtocol(values.deviceAddress, protocol);

          if (result) {
            if (result.airplay) airplayCredentials = result.airplay;
            if (result.companion) companionCredentials = result.companion;
          }
        } catch (protocolError) {
          console.error(`Error pairing ${protocol}:`, protocolError);
        }
      }

      if (airplayCredentials || companionCredentials) {
        await storeCredentials(values.deviceAddress, airplayCredentials, companionCredentials);
        await setDefaultDevice(values.deviceAddress);

        await showHUD(`✓ Pairing successful! ${values.deviceAddress} set as default device.`);
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Pairing failed",
          message: "No credentials received. Try again.",
        });
      }
    } catch (error) {
      console.error("Error during pairing:", error);
      const errorDetails = error instanceof Error ? error.message : String(error);
      console.error("Error details:", errorDetails);

      // Check for Python 3.14 incompatibility
      if (errorDetails.includes("Pydantic V1 functionality isn't compatible with Python 3.14")) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Python version incompatible",
          message: "pyatv requires Python 3.11 or 3.12. Recreate your conda env with python=3.12",
        });
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Pairing failed",
          message: errorDetails,
        });
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form
      isLoading={isLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Start Pairing" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="Pair with an Apple TV device to enable control. A 4-digit PIN will appear on your TV screen, and you'll be prompted to enter it." />
      <Form.TextField
        id="deviceAddress"
        title="Device Address"
        placeholder="192.168.1.100"
        info="IP address of your Apple TV (found in Settings > Network)"
      />
      <Form.Dropdown id="protocol" title="Protocol" defaultValue="companion">
        <Form.Dropdown.Item value="companion" title="Companion (Remote Control - Recommended)" />
        <Form.Dropdown.Item value="all" title="Companion + AirPlay (Both)" />
        <Form.Dropdown.Item value="airplay" title="AirPlay Only" />
      </Form.Dropdown>
    </Form>
  );
}
