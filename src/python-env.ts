import { environment, showToast, Toast } from "@raycast/api";
import { execFile, spawn } from "child_process";
import { createHash } from "crypto";
import { existsSync, mkdirSync, openSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const UV_VERSION = "0.12.21";
const UV_TARGETS: Record<string, { target: string; sha256: string }> = {
  arm64: {
    target: "aarch64-apple-darwin",
    sha256: "b88bda573e566ef9bced66b155fe0408626fbbc053aee1c30ba686f0728c9447",
  },
  x64: {
    target: "x86_64-apple-darwin",
    sha256: "2b336763b396ec6afa20c5a8b083538ca7402445b868311979d740a4344c17d8",
  },
};
const PYTHON_VERSION = "3.12";
const PYTHON_PACKAGES = ["pyatv==0.18.0", "pydantic>=2"];

const uvDir = join(environment.supportPath, `uv-${UV_VERSION}`);
const uvPath = join(uvDir, "uv");
const venvPath = join(environment.supportPath, "venv");
const venvReadyPath = join(venvPath, `.ready-${PYTHON_VERSION}-${PYTHON_PACKAGES.join("-")}`);
const pythonPath = join(venvPath, "bin", "python");

export const atvremotePath = join(venvPath, "bin", "atvremote");

// Keep uv state inside the extension support directory
const uvEnv: NodeJS.ProcessEnv = {
  ...process.env,
  UV_CACHE_DIR: join(environment.supportPath, "uv-cache"),
  UV_PYTHON_INSTALL_DIR: join(environment.supportPath, "python"),
  UV_PYTHON_PREFERENCE: "only-managed",
  UV_NO_CONFIG: "1",
};

let installPromise: Promise<void> | null = null;

export function installPyATV(): Promise<void> {
  if (existsSync(venvReadyPath)) {
    return Promise.resolve();
  }
  installPromise ??= (async () => {
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Setting up pyatv",
      message: "This only happens once",
    });

    // Download uv
    if (!existsSync(uvPath)) {
      const platform = UV_TARGETS[process.arch];
      if (!platform) {
        throw new Error(`Unsupported architecture: ${process.arch}`);
      }
      toast.message = "Downloading uv";
      const response = await fetch(
        `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${platform.target}.tar.gz`,
      );
      if (!response.ok) {
        throw new Error(`Failed to download uv: HTTP ${response.status}`);
      }
      const archive = Buffer.from(await response.arrayBuffer());
      const sha256 = createHash("sha256").update(archive).digest("hex");
      if (sha256 !== platform.sha256) {
        throw new Error("Checksum mismatch for downloaded uv archive");
      }
      mkdirSync(uvDir, { recursive: true });
      const archivePath = join(uvDir, "uv.tar.gz");
      writeFileSync(archivePath, archive);
      await execFileAsync("tar", ["-xzf", archivePath, "-C", uvDir, "--strip-components", "1"]);
      rmSync(archivePath);
    }

    // Create venv with pyatv
    toast.message = `Installing Python ${PYTHON_VERSION} and pyatv`;
    rmSync(venvPath, { recursive: true, force: true });
    await execFileAsync(uvPath, ["venv", "--python", PYTHON_VERSION, venvPath], { env: uvEnv });
    await execFileAsync(uvPath, ["pip", "install", "--python", pythonPath, ...PYTHON_PACKAGES], {
      env: uvEnv,
      maxBuffer: 1024 * 1024 * 10,
    });
    writeFileSync(venvReadyPath, "");

    toast.style = Toast.Style.Success;
    toast.title = "pyatv ready";
    toast.message = undefined;
  })().finally(() => {
    installPromise = null;
  });
  return installPromise;
}

export function startATVServer(): void {
  const log = openSync(join(environment.supportPath, "atv-server.log"), "a");
  const proc = spawn(pythonPath, [join(environment.assetsPath, "atv_server.py")], {
    detached: true,
    stdio: ["ignore", log, log],
  });
  proc.on("error", (error) => console.error("Failed to start ATV server:", error));
  proc.unref();
}
