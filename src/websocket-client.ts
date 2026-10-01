import WebSocket from "ws";
import { startATVServer } from "./python-env";

export interface ATVConnectInfo {
  address: string;
  companion: string;
  airplay: string;
}

let ws: WebSocket | null = null;
let connecting = false;
let wsConnected = false;
let serverStarted = false;
let connectInfo: ATVConnectInfo | null = null;
const WS_URL = "ws://127.0.0.1:8765";
const pending: Array<[string, unknown]> = [];
const RECONNECT_INTERVAL = 800;
let reconnectTimeout: NodeJS.Timeout | null = null;

function reconnect(): void {
  if (reconnectTimeout) return;

  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    if (ws) {
      ws.removeAllListeners();
    }
    startWebSocket();
  }, RECONNECT_INTERVAL);
}

function sendMessage(command: string, data: unknown = ""): void {
  // Queue if not connected
  if (!ws || !wsConnected) {
    pending.push([command, data]);
    if (!ws) startWebSocket();
    return;
  }

  // Flush pending messages first
  while (pending.length > 0) {
    const [cmd, cmdData] = pending.shift()!;
    ws.send(JSON.stringify({ cmd, data: cmdData }));
  }

  // Send current message
  console.log(`sendMessage: {cmd:${command}, data:${data}}`);
  ws.send(JSON.stringify({ cmd: command, data }));
}

function startWebSocket(): void {
  if (connecting) return;

  connecting = true;
  ws = new WebSocket(WS_URL, {
    perMessageDeflate: false,
  });

  ws.once("open", () => {
    wsConnected = true;
    connecting = false;
    // Allow a new start if the server exits later (idle timeout)
    serverStarted = false;
    console.log("WebSocket connected to ATV server");

    // The server may have restarted, so always tell it which device to use
    if (connectInfo) {
      ws?.send(JSON.stringify({ cmd: "connect", data: connectInfo }));
    }

    // Flush any pending messages
    while (pending.length > 0) {
      const [cmd, data] = pending.shift()!;
      sendMessage(cmd, data);
    }
  });

  ws.on("close", (code) => {
    wsConnected = false;
    connecting = false;
    console.log(`WebSocket closed with code ${code}`);
    reconnect();
  });

  ws.on("error", (error) => {
    wsConnected = false;
    connecting = false;
    console.error("WebSocket error:", error);

    // Start the local server once if nothing listens yet
    if (!serverStarted && (error as NodeJS.ErrnoException).code === "ECONNREFUSED") {
      serverStarted = true;
      startATVServer();
    }
  });

  ws.on("message", (data) => {
    console.log("received:", data.toString());
    // Handle responses if needed in the future
  });
}

// Fire-and-forget command sending (instant, no blocking!)
export function sendWebSocketCommand(target: ATVConnectInfo, command: string): void {
  if (!connectInfo || JSON.stringify(connectInfo) !== JSON.stringify(target)) {
    connectInfo = target;
    if (wsConnected) sendMessage("connect", target);
  }
  sendMessage("key", command);
}

export function closeWebSocket(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
}
