import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const port = Number(process.env.PORT ?? 3000);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = new Map();

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(express.static(distDir));

app.use((_req, res) => {
  res.sendFile(path.join(distDir, "index.html"));
});

wss.on("connection", (socket, request) => {
  const url = new URL(request.url ?? "", "http://localhost");
  const roomCode = normalizeRoomCode(url.searchParams.get("room"));
  const userId = normalizeUserId(url.searchParams.get("user"));

  if (!roomCode || !userId) {
    socket.close(1008, "room and user are required");
    return;
  }

  const client = { socket, roomCode, userId };
  const room = getRoom(roomCode);
  room.add(client);

  socket.on("message", (data) => {
    let event;
    try {
      event = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!isRoomEvent(event)) {
      return;
    }

    event.from = userId;
    event.at = Date.now();

    for (const peer of room) {
      if (peer !== client && peer.socket.readyState === peer.socket.OPEN) {
        peer.socket.send(JSON.stringify(event));
      }
    }
  });

  socket.on("close", () => {
    room.delete(client);
    if (room.size === 0) {
      rooms.delete(roomCode);
    }
  });
});

server.listen(port, () => {
  console.log(`Lumen is running at http://localhost:${port}`);
});

function getRoom(roomCode) {
  const existing = rooms.get(roomCode);
  if (existing) {
    return existing;
  }

  const room = new Set();
  rooms.set(roomCode, room);
  return room;
}

function normalizeRoomCode(value) {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z0-9-]{3,32}$/.test(code) ? code : "";
}

function normalizeUserId(value) {
  const id = (value ?? "").trim();
  return /^[a-zA-Z0-9-]{8,80}$/.test(id) ? id : "";
}

function isRoomEvent(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.kind === "string" &&
      value.kind.length > 0 &&
      value.kind.length < 40,
  );
}
