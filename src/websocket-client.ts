import WebSocket from "ws";

let ws: WebSocket | null = null;
let connecting = false;
let wsConnected = false;
const WS_URL = "ws://localhost:8765";
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
    console.log("WebSocket connected to ATV Desktop Remote");

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
  });

  ws.on("message", (data) => {
    console.log("received:", data.toString());
    // Handle responses if needed in the future
  });
}

// Start connection immediately when module loads
startWebSocket();

// Fire-and-forget command sending (instant, no blocking!)
export function sendWebSocketCommand(command: string): void {
  sendMessage("key", command);
}

export function closeWebSocket(): void {
  if (ws) {
    ws.close();
    ws = null;
  }
}
