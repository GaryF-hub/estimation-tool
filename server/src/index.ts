import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
});
const io = new Server(httpServer, {
  cors: { origin: "*" },
});

// ── Types ──────────────────────────────────────────────

interface Category {
  id: string;
  name: string;
  isDefault: boolean;
}

interface RoomVoter {
  id: string;
  name: string;
  socketId: string;
  isFacilitator: boolean;
}

interface Room {
  code: string;
  ticketName: string;
  ticketLink: string;
  categories: Category[];
  voters: Map<string, RoomVoter>;
  // categoryId -> voterId -> value
  votes: Map<string, Map<string, number | null>>;
  revealed: boolean;
}

// ── State ──────────────────────────────────────────────

const rooms = new Map<string, Room>();

// ── Helpers ────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
  "Solution design work",
  "UX design work (including accessibility)",
  "Backend development",
  "Backend test automation",
  "Frontend development",
  "Frontend test automation",
  "Infrastructure work (CICD pipelines, AWS cloud architecture)",
  "Regression test coverage",
  "Manual testing",
  "Accessibility testing",
  "Performance testing",
  "Scalability testing",
  "Penetration test coverage",
  "Feature flag management (creation, deletion, retest, archival)",
  "Risks of delays due to unknown specifications / dependencies on 3rd parties",
  "Rollout plan",
];

function generateId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function generateRoomCode(): string {
  // No I, O, 0, 1 to avoid confusion
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ2345679";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

/** Build the room state payload tailored for a specific voter */
function getRoomStateForVoter(room: Room, voterId: string) {
  const voters = Array.from(room.voters.values()).map((v) => ({
    id: v.id,
    name: v.name,
    isFacilitator: v.isFacilitator,
  }));

  const rows = room.categories.map((cat) => {
    const voteMap = room.votes.get(cat.id);
    const votes: Record<string, number | null | "hidden"> = {};

    for (const voter of room.voters.values()) {
      const vote = voteMap?.get(voter.id) ?? null;
      if (room.revealed || voter.id === voterId) {
        // Show actual value: my own votes always, everyone's when revealed
        votes[voter.id] = vote;
      } else {
        // Other voter, not revealed: just indicate whether they voted
        votes[voter.id] = vote !== null ? "hidden" : null;
      }
    }

    return {
      id: cat.id,
      category: cat.name,
      isDefault: cat.isDefault,
      votes,
    };
  });

  return {
    code: room.code,
    ticketName: room.ticketName,
    ticketLink: room.ticketLink,
    voters,
    rows,
    revealed: room.revealed,
  };
}

/** Send personalised state to every voter in the room */
function broadcastStateToAll(room: Room) {
  for (const voter of room.voters.values()) {
    io.to(voter.socketId).emit(
      "room-state",
      getRoomStateForVoter(room, voter.id)
    );
  }
}

// ── Socket events ──────────────────────────────────────

io.on("connection", (socket) => {
  let currentRoomCode: string | null = null;
  let currentVoterId: string | null = null;

  // ─ Create room ─
  socket.on("create-room", ({ ticketName, ticketLink, voterName }, callback) => {
    const code = generateRoomCode();
    const voterId = generateId();

    const room: Room = {
      code,
      ticketName: ticketName || "",
      ticketLink: ticketLink || "",
      categories: DEFAULT_CATEGORIES.map((cat) => ({
        id: generateId(),
        name: cat,
        isDefault: true,
      })),
      voters: new Map(),
      votes: new Map(),
      revealed: false,
    };

    // Add facilitator as first voter
    room.voters.set(voterId, {
      id: voterId,
      name: voterName,
      socketId: socket.id,
      isFacilitator: true,
    });

    // Initialise empty vote maps per category
    for (const cat of room.categories) {
      room.votes.set(cat.id, new Map());
    }

    rooms.set(code, room);
    socket.join(code);
    currentRoomCode = code;
    currentVoterId = voterId;

    console.log(`Room ${code} created by ${voterName}`);

    callback({
      success: true,
      roomCode: code,
      voterId,
      isFacilitator: true,
      state: getRoomStateForVoter(room, voterId),
    });
  });

  // ─ Join room ─
  socket.on("join-room", ({ roomCode, voterName }, callback) => {
    const code = roomCode.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      callback({ success: false, error: "Room not found. Check the code and try again." });
      return;
    }

    const voterId = generateId();
    room.voters.set(voterId, {
      id: voterId,
      name: voterName,
      socketId: socket.id,
      isFacilitator: false,
    });

    socket.join(code);
    currentRoomCode = code;
    currentVoterId = voterId;

    console.log(`${voterName} joined room ${code}`);

    callback({
      success: true,
      roomCode: code,
      voterId,
      isFacilitator: false,
      state: getRoomStateForVoter(room, voterId),
    });

    // Broadcast updated state so everyone sees the new voter column
    broadcastStateToAll(room);
  });

  // ─ Submit vote ─
  socket.on("vote", ({ rowId, value }) => {
    if (!currentRoomCode || !currentVoterId) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    let voteMap = room.votes.get(rowId);
    if (!voteMap) {
      voteMap = new Map();
      room.votes.set(rowId, voteMap);
    }
    voteMap.set(currentVoterId, value);

    broadcastStateToAll(room);
  });

  // ─ Toggle reveal (facilitator only) ─
  socket.on("toggle-reveal", () => {
    if (!currentRoomCode || !currentVoterId) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const voter = room.voters.get(currentVoterId);
    if (!voter?.isFacilitator) return;

    room.revealed = !room.revealed;
    console.log(`Room ${currentRoomCode} ${room.revealed ? "revealed" : "hidden"}`);
    broadcastStateToAll(room);
  });

  // ─ Add category (facilitator only) ─
  socket.on("add-category", ({ category }, callback) => {
    if (!currentRoomCode || !currentVoterId) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const voter = room.voters.get(currentVoterId);
    if (!voter?.isFacilitator) return;

    const cat: Category = { id: generateId(), name: category, isDefault: false };
    room.categories.push(cat);
    room.votes.set(cat.id, new Map());

    broadcastStateToAll(room);
    callback?.({ success: true });
  });

  // ─ Remove category (facilitator only) ─
  socket.on("remove-category", ({ rowId }) => {
    if (!currentRoomCode || !currentVoterId) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const voter = room.voters.get(currentVoterId);
    if (!voter?.isFacilitator) return;

    room.categories = room.categories.filter((c) => c.id !== rowId);
    room.votes.delete(rowId);

    broadcastStateToAll(room);
  });

  // ─ Edit category name (facilitator only) ─
  socket.on("edit-category", ({ rowId, name }) => {
    if (!currentRoomCode || !currentVoterId) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const voter = room.voters.get(currentVoterId);
    if (!voter?.isFacilitator) return;

    const cat = room.categories.find((c) => c.id === rowId);
    if (cat) cat.name = name;

    broadcastStateToAll(room);
  });

  // ─ Update ticket info (facilitator only) ─
  socket.on("update-ticket", ({ ticketName, ticketLink }) => {
    if (!currentRoomCode || !currentVoterId) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const voter = room.voters.get(currentVoterId);
    if (!voter?.isFacilitator) return;

    if (ticketName !== undefined) room.ticketName = ticketName;
    if (ticketLink !== undefined) room.ticketLink = ticketLink;

    broadcastStateToAll(room);
  });

  // ─ Disconnect ─
  socket.on("disconnect", () => {
    if (!currentRoomCode || !currentVoterId) return;
    const room = rooms.get(currentRoomCode);
    if (!room) return;

    const leavingVoter = room.voters.get(currentVoterId);
    const wasFacilitator = leavingVoter?.isFacilitator ?? false;
    const leavingName = leavingVoter?.name ?? "Unknown";

    room.voters.delete(currentVoterId);

    if (room.voters.size === 0) {
      rooms.delete(currentRoomCode);
      console.log(`Room ${currentRoomCode} deleted (empty)`);
    } else {
      // Promote next voter if facilitator left
      if (wasFacilitator) {
        const next = room.voters.values().next().value;
        if (next) {
          next.isFacilitator = true;
          console.log(`${next.name} promoted to facilitator in room ${currentRoomCode}`);
        }
      }
      console.log(`${leavingName} left room ${currentRoomCode}`);
      broadcastStateToAll(room);
    }
  });
});

// ── Start ──────────────────────────────────────────────

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`EstiMate server running on port ${PORT}`);
});
