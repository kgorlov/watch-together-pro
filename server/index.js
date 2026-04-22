import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { WebSocket, WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const uploadsDir = path.join(rootDir, "uploads");
const port = Number(process.env.PORT ?? 3000);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });
const rooms = new Map();
const LEAVE_GRACE_MS = 90000;
const MAX_UPLOAD_SIZE = 250 * 1024 * 1024;

fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.\w-]/g, "") || ".mp4";
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_SIZE },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype.startsWith("video/"));
  },
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "video file is required" });
    return;
  }

  res.json({
    name: req.file.originalname,
    url: `/uploads/${req.file.filename}`,
  });
});

app.use("/uploads", express.static(uploadsDir, {
  acceptRanges: true,
  immutable: true,
  maxAge: "1h",
}));

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
  room.clients.add(client);

  const existingUser = room.users.get(userId);
  if (existingUser?.leaveTimer) {
    clearTimeout(existingUser.leaveTimer);
    existingUser.leaveTimer = null;
  }

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

    if (event.kind === "hello" || event.kind === "presence") {
      rememberUser(room, userId, event);
      sendKnownRoomState(socket, room, userId);
    } else if (event.kind === "leave") {
      scheduleUserLeave(roomCode, room, userId);
      return;
    } else {
      rememberState(room, event);
    }

    broadcast(room, client, event);
  });

  socket.on("close", () => {
    room.clients.delete(client);
    scheduleUserLeave(roomCode, room, userId);
    if (room.clients.size === 0 && room.users.size === 0) {
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

  const room = {
    clients: new Set(),
    users: new Map(),
    state: {
      source: { type: "none" },
      t: 0,
      playing: false,
      from: "",
      at: Date.now(),
    },
  };
  rooms.set(roomCode, room);
  return room;
}

function rememberUser(room, userId, event) {
  const existing = room.users.get(userId);
  if (existing?.leaveTimer) {
    clearTimeout(existing.leaveTimer);
  }

  room.users.set(userId, {
    user: typeof event.user === "string" ? event.user : "Guest",
    avatar: typeof event.avatar === "string" ? event.avatar : "#6366f1",
    lastSeen: event.at,
    leaveTimer: null,
  });
}

function sendKnownRoomState(socket, room, selfId) {
  for (const [userId, user] of room.users) {
    if (userId === selfId) continue;
    send(socket, {
      kind: "presence",
      from: userId,
      user: user.user,
      avatar: user.avatar,
      at: user.lastSeen,
    });
  }

  if (room.state.source.type !== "none") {
    send(socket, {
      kind: "state-snapshot",
      source: room.state.source,
      t: estimateStateTime(room.state),
      playing: room.state.playing,
      from: room.state.from || "server",
      at: Date.now(),
    });
  }
}

function rememberState(room, event) {
  if (event.kind === "source") {
    room.state = {
      source: event.source,
      t: 0,
      playing: false,
      from: event.from,
      at: event.at,
    };
    return;
  }

  if (event.kind === "play" || event.kind === "pause" || event.kind === "seek") {
    room.state = {
      ...room.state,
      t: typeof event.t === "number" ? event.t : room.state.t,
      playing: event.kind === "play" ? true : event.kind === "pause" ? false : room.state.playing,
      from: event.from,
      at: event.at,
    };
    return;
  }

  if (event.kind === "tick") {
    room.state = {
      ...room.state,
      t: typeof event.t === "number" ? event.t : room.state.t,
      playing: Boolean(event.playing),
      from: event.from,
      at: event.at,
    };
    return;
  }

  if (event.kind === "state-snapshot") {
    room.state = {
      source: event.source,
      t: typeof event.t === "number" ? event.t : 0,
      playing: Boolean(event.playing),
      from: event.from,
      at: event.at,
    };
  }
}

function estimateStateTime(state) {
  if (!state.playing) {
    return state.t;
  }

  return state.t + Math.max(0, Date.now() - state.at) / 1000;
}

function scheduleUserLeave(roomCode, room, userId) {
  const user = room.users.get(userId);
  if (!user || user.leaveTimer) {
    return;
  }

  user.leaveTimer = setTimeout(() => {
    const stillConnected = Array.from(room.clients).some((client) => client.userId === userId);
    if (stillConnected) {
      user.leaveTimer = null;
      return;
    }

    room.users.delete(userId);
    broadcast(room, null, { kind: "leave", from: userId, at: Date.now() });
    if (room.clients.size === 0 && room.users.size === 0) {
      rooms.delete(roomCode);
    }
  }, LEAVE_GRACE_MS);
}

function broadcast(room, sender, event) {
  for (const peer of room.clients) {
    if (peer !== sender && peer.socket.readyState === WebSocket.OPEN) {
      send(peer.socket, event);
    }
  }
}

function send(socket, event) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event));
  }
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
