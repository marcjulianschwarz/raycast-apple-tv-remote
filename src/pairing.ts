import { showToast, Toast } from "@raycast/api";
import { exec, spawn } from "child_process";
import { atvremotePath } from "./python-env";

export async function pairDevice(
  deviceAddress: string,
  protocol: "companion" | "airplay",
): Promise<{ airplay?: string; companion?: string } | null> {
  return new Promise((resolve) => {
    const args = ["-s", deviceAddress, "--protocol", protocol, "pair"];

    console.log("Spawning command:", atvremotePath, args);

    const proc = spawn(atvremotePath, args, {
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
