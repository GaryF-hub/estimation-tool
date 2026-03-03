"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  UserPlus,
  UserMinus,
  Download,
  BarChart3,
  Sparkles,
  RotateCcw,
  Save,
  FolderOpen,
  Link,
  Pencil,
  Copy,
  Check,
  Wifi,
  WifiOff,
  Users,
  Monitor,
} from "lucide-react";
import {
  Voter,
  EstimationRow,
  EstimationSession,
  OnlineRoomState,
  DEFAULT_CATEGORIES,
} from "@/lib/types";
import { exportToExcel } from "@/lib/export-excel";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import type { Socket } from "socket.io-client";

function generateId() {
  return Math.random().toString(36).slice(2, 9);
}

function createDefaultSession(): EstimationSession {
  const voters: Voter[] = [];
  const rows: EstimationRow[] = DEFAULT_CATEGORIES.map((cat) => ({
    id: generateId(),
    category: cat,
    votes: {},
    hidden: true,
    isDefault: true,
  }));

  return {
    id: generateId(),
    ticketLink: "",
    ticketName: "",
    voters,
    rows,
    createdAt: new Date().toISOString(),
  };
}

// Consistent colors per stat type
const STAT_STYLES = {
  min: { text: "text-sky-400", bg: "bg-sky-500/10" },
  max: { text: "text-amber-400", bg: "bg-amber-500/10" },
  avg: { text: "text-emerald-400", bg: "bg-emerald-500/10" },
} as const;

// Active cell identifier
type ActiveCell = { rowIdx: number; voterId: string } | null;

type AppMode = "lobby" | "offline" | "online";

// ── Vote Cell Component ────────────────────────────────

function VoteCell({
  value,
  hidden,
  isActive,
  readOnly,
  onCommit,
  onActivate,
  onNavigate,
}: {
  value: number | null | undefined | "hidden";
  hidden: boolean;
  isActive: boolean;
  readOnly: boolean;
  onCommit: (val: number | null) => void;
  onActivate: () => void;
  onNavigate: (direction: "up" | "down") => void;
}) {
  const [localValue, setLocalValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const isHiddenVote = value === "hidden";
  const numericValue = isHiddenVote ? null : (value as number | null | undefined);
  const hasVote = isHiddenVote || numericValue != null;

  // When becoming active, initialize local value
  useEffect(() => {
    if (isActive && !readOnly) {
      setLocalValue(numericValue != null ? String(numericValue) : "");
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(() => {
    const trimmed = localValue.trim();
    if (trimmed === "") {
      onCommit(null);
    } else {
      const num = parseFloat(trimmed);
      if (!isNaN(num) && num >= 0) {
        onCommit(num);
      }
    }
  }, [localValue, onCommit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      commit();
      onNavigate("down");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      commit();
      onNavigate("up");
    } else if (e.key === "Escape") {
      onCommit(numericValue ?? null);
    }
  };

  const handleBlur = () => {
    commit();
  };

  // Active editing state - show input (only when not readOnly)
  if (isActive && !readOnly) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="0.5"
        min="0"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={`w-16 h-8 rounded-md text-center text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 border transition-colors ${
          hidden
            ? "bg-background/30 border-border/30"
            : hasVote
            ? "bg-emerald-600/10 border-emerald-500/30 text-emerald-200"
            : "bg-background/30 border-border/30"
        }`}
        placeholder="days"
      />
    );
  }

  // Hidden vote from another user (online mode) - show "Voted" badge
  if (isHiddenVote) {
    return (
      <div className="mx-auto w-16 h-8 rounded-md bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center">
        <span className="text-emerald-400 text-xs font-medium">Voted</span>
      </div>
    );
  }

  // Hidden mode - not editing
  if (hidden) {
    if (hasVote) {
      return (
        <button
          onClick={readOnly ? undefined : onActivate}
          className={`mx-auto w-16 h-8 rounded-md bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center gap-1 transition-colors group/vote ${
            readOnly ? "cursor-default" : "hover:bg-emerald-600/30 cursor-pointer"
          }`}
          title={readOnly ? undefined : "Click to edit your vote"}
        >
          <span className="text-emerald-400 text-xs font-medium">Voted</span>
          {!readOnly && (
            <Pencil className="w-2.5 h-2.5 text-emerald-400/50 opacity-0 group-hover/vote:opacity-100 transition-opacity" />
          )}
        </button>
      );
    }
    return (
      <button
        onClick={readOnly ? undefined : onActivate}
        className={`w-16 h-8 bg-background/30 rounded-md text-center text-sm border border-border/30 transition-colors text-muted-foreground/40 ${
          readOnly ? "cursor-default" : "hover:border-emerald-500/40 cursor-pointer"
        }`}
      >
        —
      </button>
    );
  }

  // Revealed mode - not editing, show value as clickable
  return (
    <button
      onClick={readOnly ? undefined : onActivate}
      className={`w-16 h-8 rounded-md text-center text-sm border transition-colors ${
        readOnly ? "cursor-default" : "cursor-pointer"
      } ${
        hasVote
          ? `bg-emerald-600/10 border-emerald-500/30 text-emerald-200 ${!readOnly ? "hover:bg-emerald-600/20" : ""}`
          : `bg-background/30 border-border/30 ${!readOnly ? "hover:border-border/60" : ""} text-muted-foreground/40`
      }`}
    >
      {hasVote ? numericValue : "—"}
    </button>
  );
}

// ── Lobby Component ────────────────────────────────────

function Lobby({
  onCreateRoom,
  onJoinRoom,
  onGoOffline,
  connecting,
  connected,
  serverError,
}: {
  onCreateRoom: (voterName: string, ticketName: string) => void;
  onJoinRoom: (roomCode: string, voterName: string) => void;
  onGoOffline: () => void;
  connecting: boolean;
  connected: boolean;
  serverError: string;
}) {
  const [createName, setCreateName] = useState("");
  const [createTicket, setCreateTicket] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-6"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-emerald-400" />
            <h1 className="text-4xl font-bold gradient-text">EstiMate</h1>
            <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
          </div>
          <p className="text-muted-foreground text-sm">
            Team estimation tool — planning poker style
          </p>
        </div>

        {/* Create Session */}
        <div className="glass-strong rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-emerald-300">
              Create Session
            </h2>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Your name *"
              value={createName}
              disabled={connecting}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && createName.trim() && !connecting) {
                  onCreateRoom(createName.trim(), createTicket.trim());
                }
              }}
              className="w-full bg-background/30 rounded-lg px-4 py-2.5 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors disabled:opacity-50"
            />
            <input
              type="text"
              placeholder="Ticket name (optional, e.g. PROJ-1234)"
              value={createTicket}
              disabled={connecting}
              onChange={(e) => setCreateTicket(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && createName.trim() && !connecting) {
                  onCreateRoom(createName.trim(), createTicket.trim());
                }
              }}
              className="w-full bg-background/30 rounded-lg px-4 py-2.5 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors disabled:opacity-50"
            />
            <button
              disabled={connecting}
              onClick={() => {
                if (!createName.trim()) {
                  setError("Enter your name to create a session");
                  return;
                }
                setError("");
                onCreateRoom(createName.trim(), createTicket.trim());
              }}
              className={`w-full py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                connecting
                  ? "bg-emerald-600/10 text-emerald-300/50 border-emerald-500/20 cursor-wait"
                  : "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border-emerald-500/30"
              }`}
            >
              {connecting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Initialising, please wait...
                </>
              ) : (
                "Create & Start"
              )}
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-xs text-muted-foreground/50 uppercase tracking-wider">
            or
          </span>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        {/* Join Session */}
        <div className="glass-strong rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wifi className="w-5 h-5 text-sky-400" />
            <h2 className="text-lg font-semibold text-sky-300">
              Join Session
            </h2>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Room code (e.g. ABCD)"
              value={joinCode}
              disabled={connecting}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full bg-background/30 rounded-lg px-4 py-2.5 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-colors uppercase tracking-widest text-center font-mono text-lg disabled:opacity-50"
            />
            <input
              type="text"
              placeholder="Your name *"
              value={joinName}
              disabled={connecting}
              onChange={(e) => setJoinName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && joinCode.trim() && joinName.trim() && !connecting) {
                  onJoinRoom(joinCode.trim(), joinName.trim());
                }
              }}
              className="w-full bg-background/30 rounded-lg px-4 py-2.5 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-colors disabled:opacity-50"
            />
            <button
              disabled={connecting}
              onClick={() => {
                if (!joinCode.trim() || !joinName.trim()) {
                  setError("Enter room code and your name to join");
                  return;
                }
                setError("");
                onJoinRoom(joinCode.trim(), joinName.trim());
              }}
              className={`w-full py-2.5 rounded-lg text-sm font-medium border transition-all flex items-center justify-center gap-2 ${
                connecting
                  ? "bg-sky-600/10 text-sky-300/50 border-sky-500/20 cursor-wait"
                  : "bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 border border-sky-500/30"
              }`}
            >
              {connecting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Initialising, please wait...
                </>
              ) : (
                "Join Session"
              )}
            </button>
          </div>
        </div>

        {/* Connecting info */}
        <AnimatePresence>
          {connecting && !connected && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs text-muted-foreground/70"
            >
              First launch may take up to 30 seconds (using free tier). Please wait while the app starts up.
            </motion.p>
          )}
        </AnimatePresence>

        {/* Error */}
        <AnimatePresence>
          {!connecting && (error || serverError) && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-center text-xs text-rose-400"
            >
              {error || serverError}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-xs text-muted-foreground/50 uppercase tracking-wider">
            or
          </span>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        {/* Offline mode */}
        <button
          onClick={onGoOffline}
          className="w-full glass-strong rounded-xl p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Monitor className="w-4 h-4" />
          Use Offline (Solo / Facilitator Mode)
        </button>
      </motion.div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────

export default function Home() {
  // App mode
  const [mode, setMode] = useState<AppMode>("lobby");
  const [lobbyError, setLobbyError] = useState("");

  // Online mode state
  const socketRef = useRef<Socket | null>(null);
  const [roomCode, setRoomCode] = useState("");
  const [myVoterId, setMyVoterId] = useState<string | null>(null);
  const [isFacilitator, setIsFacilitator] = useState(false);
  const [onlineState, setOnlineState] = useState<OnlineRoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Offline mode state (original)
  const [session, setSession] = useState<EstimationSession>(createDefaultSession);
  const [newVoterName, setNewVoterName] = useState("");
  const [showAddVoter, setShowAddVoter] = useState(false);
  const [newRowCategory, setNewRowCategory] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);
  const [allHidden, setAllHidden] = useState(true);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const addVoterRef = useRef<HTMLInputElement>(null);
  const addRowRef = useRef<HTMLInputElement>(null);

  // ── Offline auto-save ────────────────────────────────
  useEffect(() => {
    if (mode !== "offline") return;
    const saved = localStorage.getItem("estimation-session");
    if (saved) {
      try {
        setSession(JSON.parse(saved));
      } catch {
        // ignore
      }
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "offline") {
      localStorage.setItem("estimation-session", JSON.stringify(session));
    }
  }, [session, mode]);

  useEffect(() => {
    if (showAddVoter) addVoterRef.current?.focus();
  }, [showAddVoter]);
  useEffect(() => {
    if (showAddRow) addRowRef.current?.focus();
  }, [showAddRow]);

  // ── Socket cleanup on unmount ────────────────────────
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  // ── Online mode handlers ─────────────────────────────

  const [connecting, setConnecting] = useState(false);

  const setupSocket = useCallback((socket: Socket) => {
    socket.off("connect");
    socket.off("disconnect");
    socket.off("room-state");
    socket.off("connect_error");

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("room-state", (state: OnlineRoomState) => {
      setOnlineState(state);
    });
  }, []);

  const handleCreateRoom = useCallback(
    (voterName: string, ticketName: string) => {
      setConnecting(true);
      setLobbyError("");

      const socket = connectSocket();
      socketRef.current = socket;
      setupSocket(socket);

      const doCreate = () => {
        socket.emit(
          "create-room",
          { voterName, ticketName, ticketLink: "" },
          (response: {
            success: boolean;
            roomCode: string;
            voterId: string;
            isFacilitator: boolean;
            state: OnlineRoomState;
            error?: string;
          }) => {
            setConnecting(false);
            if (response.success) {
              setMode("online");
              setRoomCode(response.roomCode);
              setMyVoterId(response.voterId);
              setIsFacilitator(response.isFacilitator);
              setOnlineState(response.state);
              setLobbyError("");
            } else {
              setLobbyError(response.error || "Failed to create room");
            }
          }
        );
      };

      if (socket.connected) {
        doCreate();
      } else {
        socket.once("connect", doCreate);
        socket.once("connect_error", () => {
          setConnecting(false);
          setLobbyError("Could not connect — please try again.");
          disconnectSocket();
          socketRef.current = null;
        });
        // Timeout after 45 seconds
        setTimeout(() => {
          if (!socket.connected) {
            setConnecting(false);
            setLobbyError("Connection timed out — please try again.");
            disconnectSocket();
            socketRef.current = null;
          }
        }, 45000);
      }
    },
    [setupSocket]
  );

  const handleJoinRoom = useCallback(
    (code: string, voterName: string) => {
      setConnecting(true);
      setLobbyError("");

      const socket = connectSocket();
      socketRef.current = socket;
      setupSocket(socket);

      const doJoin = () => {
        socket.emit(
          "join-room",
          { roomCode: code, voterName },
          (response: {
            success: boolean;
            roomCode: string;
            voterId: string;
            isFacilitator: boolean;
            state: OnlineRoomState;
            error?: string;
          }) => {
            setConnecting(false);
            if (response.success) {
              setMode("online");
              setRoomCode(response.roomCode);
              setMyVoterId(response.voterId);
              setIsFacilitator(response.isFacilitator);
              setOnlineState(response.state);
              setLobbyError("");
            } else {
              setLobbyError(response.error || "Failed to join room");
              disconnectSocket();
              socketRef.current = null;
            }
          }
        );
      };

      if (socket.connected) {
        doJoin();
      } else {
        socket.once("connect", doJoin);
        socket.once("connect_error", () => {
          setConnecting(false);
          setLobbyError("Could not connect — please try again.");
          disconnectSocket();
          socketRef.current = null;
        });
        setTimeout(() => {
          if (!socket.connected) {
            setConnecting(false);
            setLobbyError("Connection timed out — please try again.");
            disconnectSocket();
            socketRef.current = null;
          }
        }, 45000);
      }
    },
    [setupSocket]
  );

  const handleLeaveRoom = useCallback(() => {
    disconnectSocket();
    socketRef.current = null;
    setMode("lobby");
    setOnlineState(null);
    setMyVoterId(null);
    setIsFacilitator(false);
    setRoomCode("");
    setConnected(false);
  }, []);

  const copyRoomCode = useCallback(() => {
    navigator.clipboard.writeText(roomCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [roomCode]);

  // ── Online socket emitters ───────────────────────────

  const emitVote = useCallback(
    (rowId: string, value: number | null) => {
      socketRef.current?.emit("vote", { rowId, value });
    },
    []
  );

  const emitToggleReveal = useCallback(() => {
    socketRef.current?.emit("toggle-reveal");
  }, []);

  const emitAddCategory = useCallback((category: string) => {
    socketRef.current?.emit("add-category", { category }, () => {});
  }, []);

  const emitRemoveCategory = useCallback((rowId: string) => {
    socketRef.current?.emit("remove-category", { rowId });
  }, []);

  const emitEditCategory = useCallback((rowId: string, name: string) => {
    socketRef.current?.emit("edit-category", { rowId, name });
  }, []);

  const emitUpdateTicket = useCallback(
    (ticketName: string, ticketLink: string) => {
      socketRef.current?.emit("update-ticket", { ticketName, ticketLink });
    },
    []
  );

  // ── Offline mode handlers (unchanged) ────────────────

  const addVoter = useCallback(() => {
    const name = newVoterName.trim();
    if (!name) return;
    const voter: Voter = { id: generateId(), name };
    setSession((s) => ({ ...s, voters: [...s.voters, voter] }));
    setNewVoterName("");
    setShowAddVoter(false);
  }, [newVoterName]);

  const removeVoter = useCallback((voterId: string) => {
    setSession((s) => ({
      ...s,
      voters: s.voters.filter((v) => v.id !== voterId),
      rows: s.rows.map((r) => {
        const votes = { ...r.votes };
        delete votes[voterId];
        return { ...r, votes };
      }),
    }));
  }, []);

  const addRow = useCallback(() => {
    const category = newRowCategory.trim();
    if (!category) return;
    if (mode === "online") {
      emitAddCategory(category);
    } else {
      const row: EstimationRow = {
        id: generateId(),
        category,
        votes: {},
        hidden: allHidden,
        isDefault: false,
      };
      setSession((s) => ({ ...s, rows: [...s.rows, row] }));
    }
    setNewRowCategory("");
    setShowAddRow(false);
  }, [newRowCategory, allHidden, mode, emitAddCategory]);

  const removeRow = useCallback(
    (rowId: string) => {
      if (mode === "online") {
        emitRemoveCategory(rowId);
      } else {
        setSession((s) => ({
          ...s,
          rows: s.rows.filter((r) => r.id !== rowId),
        }));
      }
    },
    [mode, emitRemoveCategory]
  );

  const commitVote = useCallback(
    (rowId: string, voterId: string, value: number | null) => {
      if (mode === "online") {
        emitVote(rowId, value);
      } else {
        setSession((s) => ({
          ...s,
          rows: s.rows.map((r) =>
            r.id === rowId
              ? { ...r, votes: { ...r.votes, [voterId]: value } }
              : r
          ),
        }));
      }
    },
    [mode, emitVote]
  );

  const navigateCell = useCallback(
    (currentRowIdx: number, voterId: string, direction: "up" | "down") => {
      const rowCount =
        mode === "online"
          ? onlineState?.rows.length ?? 0
          : session.rows.length;
      const nextIdx =
        direction === "down" ? currentRowIdx + 1 : currentRowIdx - 1;
      if (nextIdx >= 0 && nextIdx < rowCount) {
        setActiveCell({ rowIdx: nextIdx, voterId });
      } else {
        setActiveCell(null);
      }
    },
    [mode, onlineState?.rows.length, session.rows.length]
  );

  const toggleRowVisibility = useCallback((rowId: string) => {
    setSession((s) => ({
      ...s,
      rows: s.rows.map((r) =>
        r.id === rowId ? { ...r, hidden: !r.hidden } : r
      ),
    }));
  }, []);

  const toggleAllVisibility = useCallback(() => {
    if (mode === "online") {
      emitToggleReveal();
    } else {
      const newHidden = !allHidden;
      setAllHidden(newHidden);
      setSession((s) => ({
        ...s,
        rows: s.rows.map((r) => ({ ...r, hidden: newHidden })),
      }));
    }
  }, [allHidden, mode, emitToggleReveal]);

  const resetSession = useCallback(() => {
    if (
      !confirm(
        "Reset everything? This clears all voters, votes, and custom rows."
      )
    )
      return;
    setSession(createDefaultSession());
    setAllHidden(true);
    setActiveCell(null);
  }, []);

  const saveSession = useCallback(() => {
    const json = JSON.stringify(session, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estimation-${session.ticketName || "session"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [session]);

  const loadSession = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const loaded = JSON.parse(ev.target?.result as string);
          setSession(loaded);
          setAllHidden(loaded.rows.every((r: EstimationRow) => r.hidden));
        } catch {
          alert("Invalid session file");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  // ── Computed display data ────────────────────────────

  const isOnline = mode === "online";
  const revealed = isOnline ? onlineState?.revealed ?? false : !allHidden;

  // Voters to display
  const displayVoters: { id: string; name: string }[] = isOnline
    ? onlineState?.voters ?? []
    : session.voters;

  // Rows to display
  const displayRows = isOnline
    ? (onlineState?.rows ?? []).map((r) => ({
        id: r.id,
        category: r.category,
        votes: r.votes,
        hidden: !onlineState!.revealed,
        isDefault: r.isDefault,
      }))
    : session.rows;

  const displayTicketName = isOnline
    ? onlineState?.ticketName ?? ""
    : session.ticketName;
  const displayTicketLink = isOnline
    ? onlineState?.ticketLink ?? ""
    : session.ticketLink;

  // Stats calculation
  const getRowStats = (row: {
    votes: Record<string, number | null | "hidden">;
  }) => {
    const numericVotes = displayVoters
      .map((v) => row.votes[v.id])
      .filter((v): v is number => typeof v === "number");
    if (numericVotes.length === 0) return { min: null, max: null, avg: null };
    return {
      min: Math.min(...numericVotes),
      max: Math.max(...numericVotes),
      avg:
        Math.round(
          (numericVotes.reduce((a, b) => a + b, 0) / numericVotes.length) * 10
        ) / 10,
    };
  };

  const totalAvg = displayRows.reduce((sum, row) => {
    const stats = getRowStats(row);
    return sum + (stats.avg ?? 0);
  }, 0);

  // Build an EstimationSession for Excel export (online mode)
  const getExportSession = (): EstimationSession => {
    if (!isOnline) return session;
    return {
      id: roomCode,
      ticketName: onlineState?.ticketName ?? "",
      ticketLink: onlineState?.ticketLink ?? "",
      voters: (onlineState?.voters ?? []).map((v) => ({
        id: v.id,
        name: v.name,
      })),
      rows: (onlineState?.rows ?? []).map((r) => ({
        id: r.id,
        category: r.category,
        votes: Object.fromEntries(
          Object.entries(r.votes).map(([k, v]) => [
            k,
            v === "hidden" ? null : v,
          ])
        ),
        hidden: false,
        isDefault: r.isDefault,
      })),
      createdAt: "",
    };
  };

  // ── Lobby mode ───────────────────────────────────────

  if (mode === "lobby") {
    return (
      <>
        <Lobby
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onGoOffline={() => setMode("offline")}
          connecting={connecting}
          connected={connected}
          serverError={lobbyError}
        />
        <AnimatePresence>
          {lobbyError && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-rose-600/20 border border-rose-500/30 text-rose-300 text-sm"
            >
              {lobbyError}
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  // ── Grid mode (online + offline) ─────────────────────

  return (
    <div className="max-w-[100vw] overflow-x-auto px-4 py-8 md:px-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-center"
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <BarChart3 className="w-8 h-8 text-emerald-400" />
          <h1 className="text-4xl font-bold gradient-text">EstiMate</h1>
          <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
        </div>
        <p className="text-muted-foreground text-sm">
          Team estimation tool — planning poker style
        </p>
      </motion.div>

      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-strong rounded-xl p-4 mb-6 flex flex-wrap items-center gap-3"
      >
        {/* Online: Room code + connection status */}
        {isOnline && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {connected ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-rose-400" />
              )}
              <button
                onClick={copyRoomCode}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-background/30 border border-border/30 hover:border-emerald-500/40 transition-colors"
                title="Click to copy room code"
              >
                <span className="font-mono text-lg font-bold text-emerald-300 tracking-widest">
                  {roomCode}
                </span>
                {codeCopied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            </div>
            <span className="text-xs text-muted-foreground">
              {displayVoters.length} voter{displayVoters.length !== 1 && "s"}{" "}
              connected
            </span>
            <div className="w-px h-6 bg-border/40" />
          </div>
        )}

        {/* Ticket fields — facilitator only in online, always in offline */}
        {(!isOnline || isFacilitator) && (
          <div className="flex items-center gap-2 min-w-[280px]">
            <Link className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Ticket name (e.g. PROJ-1234)"
              value={displayTicketName}
              onChange={(e) => {
                if (isOnline) {
                  emitUpdateTicket(e.target.value, displayTicketLink);
                } else {
                  setSession((s) => ({ ...s, ticketName: e.target.value }));
                }
              }}
              className="bg-transparent border-b border-border/50 px-2 py-1 text-sm focus:outline-none focus:border-emerald-500 transition-colors w-40"
            />
            <input
              type="text"
              placeholder="Ticket URL (optional)"
              value={displayTicketLink}
              onChange={(e) => {
                if (isOnline) {
                  emitUpdateTicket(displayTicketName, e.target.value);
                } else {
                  setSession((s) => ({ ...s, ticketLink: e.target.value }));
                }
              }}
              className="bg-transparent border-b border-border/50 px-2 py-1 text-sm focus:outline-none focus:border-emerald-500 transition-colors w-[420px]"
            />
          </div>
        )}

        {/* Online: Show ticket name for non-facilitators (read-only) */}
        {isOnline && !isFacilitator && displayTicketName && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link className="w-4 h-4 shrink-0" />
            <span>{displayTicketName}</span>
          </div>
        )}

        {/* Buttons — pushed to far right */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* Reveal/Hide — facilitator only in online, always in offline */}
          {(!isOnline || isFacilitator) && (
            <>
              <button
                onClick={toggleAllVisibility}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  !revealed
                    ? "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
                    : "bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
                }`}
                title={
                  !revealed
                    ? "Reveal all scores so everyone can see the results"
                    : "Hide all scores for blind voting"
                }
              >
                {!revealed ? (
                  <Eye className="w-3.5 h-3.5" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                {!revealed ? "Reveal All" : "Hide All"}
              </button>
              <div className="w-px h-6 bg-border/40 mx-1" />
            </>
          )}

          <button
            onClick={() => exportToExcel(getExportSession())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 transition-all"
            title="Download as .xlsx Excel file"
          >
            <Download className="w-3.5 h-3.5" />
            Export Excel
          </button>

          {/* Offline-only: Save / Load / Reset */}
          {!isOnline && (
            <>
              <div className="w-px h-6 bg-border/40 mx-1" />
              <button
                onClick={saveSession}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 transition-all"
                title="Download this session as a JSON file"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
              <button
                onClick={loadSession}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 transition-all"
                title="Load a previously saved session JSON file"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Load
              </button>
              <button
                onClick={resetSession}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 transition-all"
                title="Clear everything and start fresh"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            </>
          )}

          {/* Online: Leave room */}
          {isOnline && (
            <>
              <div className="w-px h-6 bg-border/40 mx-1" />
              <button
                onClick={handleLeaveRoom}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 transition-all"
                title="Leave this session and return to lobby"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Leave
              </button>
            </>
          )}
        </div>
      </motion.div>

      {/* Main Grid */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-strong rounded-xl overflow-hidden glow-green"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-emerald-900/30 to-teal-900/30">
                <th className="sticky left-0 z-20 bg-[hsl(165,30%,10%)] text-left px-4 py-3 text-xs font-semibold text-emerald-300 uppercase tracking-wider min-w-[320px]">
                  Work Category
                </th>
                {displayVoters.map((voter) => (
                  <th
                    key={voter.id}
                    className="px-2 py-3 text-center min-w-[90px] group"
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span
                        className={`text-xs font-semibold truncate max-w-[70px] ${
                          isOnline && voter.id === myVoterId
                            ? "text-emerald-200"
                            : "text-emerald-300"
                        }`}
                      >
                        {voter.name}
                        {isOnline && voter.id === myVoterId && (
                          <span className="text-[10px] text-emerald-400/60 ml-1">
                            (you)
                          </span>
                        )}
                      </span>
                      {/* Remove voter — offline only */}
                      {!isOnline && (
                        <button
                          onClick={() => removeVoter(voter.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400 hover:text-rose-300"
                          title="Remove voter"
                        >
                          <UserMinus className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
                {/* Add voter — offline only */}
                {!isOnline && (
                  <th className="px-2 py-3 text-center min-w-[50px]">
                    {showAddVoter ? (
                      <div className="flex items-center gap-1">
                        <input
                          ref={addVoterRef}
                          type="text"
                          placeholder="Name"
                          value={newVoterName}
                          onChange={(e) => setNewVoterName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addVoter();
                            if (e.key === "Escape") setShowAddVoter(false);
                          }}
                          className="w-20 bg-background/50 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        <button
                          onClick={addVoter}
                          className="text-emerald-400 hover:text-emerald-300"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddVoter(true)}
                        className="text-emerald-400 hover:text-emerald-300 transition-colors"
                        title="Add voter"
                      >
                        <UserPlus className="w-4 h-4 mx-auto" />
                      </button>
                    )}
                  </th>
                )}
                {/* Eye toggle column — offline only */}
                {!isOnline && (
                  <th className="px-2 py-3 text-center min-w-[44px]">
                    <button
                      onClick={toggleAllVisibility}
                      className="text-emerald-400 hover:text-emerald-300 transition-colors"
                      title={!revealed ? "Reveal all" : "Hide all"}
                    >
                      {!revealed ? (
                        <EyeOff className="w-4 h-4 mx-auto" />
                      ) : (
                        <Eye className="w-4 h-4 mx-auto" />
                      )}
                    </button>
                  </th>
                )}
                <th className="px-3 py-3 text-center min-w-[65px] text-xs font-semibold text-sky-400 uppercase tracking-wider">
                  MIN
                </th>
                <th className="px-3 py-3 text-center min-w-[65px] text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  MAX
                </th>
                <th className="px-3 py-3 text-center min-w-[65px] text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  AVG
                </th>
              </tr>
            </thead>

            <tbody>
              <AnimatePresence>
                {displayRows.map((row, idx) => {
                  const stats = getRowStats(row);
                  const hasVotes = stats.avg !== null;

                  return (
                    <motion.tr
                      key={row.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: idx * 0.02 }}
                      className={`group border-t border-border/30 transition-colors ${
                        idx % 2 === 0
                          ? "bg-transparent"
                          : "bg-white/[0.01]"
                      } hover:bg-white/[0.03]`}
                    >
                      <td className="sticky left-0 z-10 bg-[hsl(222,47%,7%)] group-hover:bg-[hsl(222,47%,9%)] transition-colors px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {/* Remove row — facilitator only in online, always in offline */}
                          {(!isOnline || isFacilitator) && (
                            <button
                              onClick={() => removeRow(row.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400/60 hover:text-rose-400 shrink-0"
                              title="Remove row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {editingCategory === row.id &&
                          (!isOnline || isFacilitator) ? (
                            <input
                              type="text"
                              value={row.category}
                              onChange={(e) => {
                                if (isOnline) {
                                  emitEditCategory(row.id, e.target.value);
                                } else {
                                  setSession((s) => ({
                                    ...s,
                                    rows: s.rows.map((r) =>
                                      r.id === row.id
                                        ? { ...r, category: e.target.value }
                                        : r
                                    ),
                                  }));
                                }
                              }}
                              onBlur={() => setEditingCategory(null)}
                              onKeyDown={(e) => {
                                if (
                                  e.key === "Enter" ||
                                  e.key === "Escape"
                                )
                                  setEditingCategory(null);
                              }}
                              autoFocus
                              className="bg-background/50 rounded px-2 py-0.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          ) : (
                            <span
                              onClick={() => {
                                if (!isOnline || isFacilitator) {
                                  setEditingCategory(row.id);
                                }
                              }}
                              className={`text-sm text-foreground/90 transition-colors ${
                                !isOnline || isFacilitator
                                  ? "cursor-pointer hover:text-emerald-300"
                                  : ""
                              }`}
                              title={
                                !isOnline || isFacilitator
                                  ? "Click to edit"
                                  : undefined
                              }
                            >
                              {row.category}
                            </span>
                          )}
                        </div>
                      </td>

                      {displayVoters.map((voter) => {
                        const isMyColumn =
                          !isOnline || voter.id === myVoterId;
                        const cellValue = row.votes[voter.id];

                        return (
                          <td
                            key={voter.id}
                            className="px-1 py-1.5 text-center"
                          >
                            <VoteCell
                              value={cellValue}
                              hidden={
                                isOnline
                                  ? false // In online mode, visibility is handled by "hidden" vote values from server
                                  : row.hidden
                              }
                              isActive={
                                activeCell?.rowIdx === idx &&
                                activeCell?.voterId === voter.id
                              }
                              readOnly={!isMyColumn}
                              onCommit={(val) => {
                                commitVote(row.id, voter.id, val);
                                setActiveCell(null);
                              }}
                              onActivate={() =>
                                setActiveCell({
                                  rowIdx: idx,
                                  voterId: voter.id,
                                })
                              }
                              onNavigate={(dir) =>
                                navigateCell(idx, voter.id, dir)
                              }
                            />
                          </td>
                        );
                      })}

                      {/* Empty cell for add-voter column — offline only */}
                      {!isOnline && <td className="px-1 py-1.5" />}

                      {/* Per-row eye toggle — offline only */}
                      {!isOnline && (
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => toggleRowVisibility(row.id)}
                            className="p-1.5 rounded-md transition-all text-emerald-400 bg-emerald-600/10 hover:bg-emerald-600/20"
                            title={
                              row.hidden ? "Reveal scores" : "Hide scores"
                            }
                          >
                            {row.hidden ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </td>
                      )}

                      <td className="px-3 py-1.5 text-center">
                        {hasVotes && revealed ? (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${STAT_STYLES.min.text} ${STAT_STYLES.min.bg}`}
                          >
                            {stats.min}
                          </motion.span>
                        ) : hasVotes ? (
                          <span className="text-xs text-muted-foreground/30">
                            •••
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {hasVotes && revealed ? (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-medium ${STAT_STYLES.max.text} ${STAT_STYLES.max.bg}`}
                          >
                            {stats.max}
                          </motion.span>
                        ) : hasVotes ? (
                          <span className="text-xs text-muted-foreground/30">
                            •••
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        {hasVotes && revealed ? (
                          <motion.span
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${STAT_STYLES.avg.text} ${STAT_STYLES.avg.bg}`}
                          >
                            {stats.avg}
                          </motion.span>
                        ) : hasVotes ? (
                          <span className="text-xs text-muted-foreground/30">
                            •••
                          </span>
                        ) : null}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>

              {/* Add row — facilitator only in online, always in offline */}
              {(!isOnline || isFacilitator) && (
                <tr className="border-t border-border/30">
                  <td
                    colSpan={
                      displayVoters.length +
                      (isOnline ? 4 : 6)
                    }
                    className="px-4 py-2"
                  >
                    {showAddRow ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={addRowRef}
                          type="text"
                          placeholder="Enter work category name..."
                          value={newRowCategory}
                          onChange={(e) => setNewRowCategory(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addRow();
                            if (e.key === "Escape") setShowAddRow(false);
                          }}
                          className="bg-background/30 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 border border-border/30 flex-1 max-w-md"
                        />
                        <button
                          onClick={addRow}
                          className="px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 transition-colors"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setShowAddRow(false)}
                          className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddRow(true)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-emerald-300 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add work category
                      </button>
                    )}
                  </td>
                </tr>
              )}

              {/* Total row */}
              <tr className="border-t-2 border-emerald-500/30 bg-gradient-to-r from-emerald-900/20 to-teal-900/20">
                <td className="sticky left-0 z-10 bg-[hsl(165,25%,9%)] px-4 py-3">
                  <span className="text-sm font-bold text-emerald-300 uppercase tracking-wider">
                    Total Estimate
                  </span>
                </td>
                {displayVoters.map((voter) => (
                  <td key={voter.id} className="px-1 py-3 text-center">
                    {(() => {
                      const voterTotal = displayRows.reduce((sum, row) => {
                        const vote = row.votes[voter.id];
                        return sum + (typeof vote === "number" ? vote : 0);
                      }, 0);
                      const anyVoted = displayRows.some(
                        (r) => typeof r.votes[voter.id] === "number"
                      );
                      return anyVoted && revealed ? (
                        <span className="text-xs font-mono font-bold text-emerald-300">
                          {Math.round(voterTotal * 10) / 10}
                        </span>
                      ) : null;
                    })()}
                  </td>
                ))}
                {!isOnline && <td />}
                {!isOnline && <td />}
                <td />
                <td />
                <td className="px-3 py-3 text-center">
                  {revealed ? (
                    <motion.div
                      key={totalAvg}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className="inline-block px-3 py-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30"
                    >
                      <span className="text-lg font-bold font-mono text-emerald-300">
                        {Math.round(totalAvg * 10) / 10}
                      </span>
                      <span className="text-[10px] text-emerald-400 ml-1">
                        days
                      </span>
                    </motion.div>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-6 text-center text-xs text-muted-foreground/50"
      >
        <p>
          {displayVoters.length} voter
          {displayVoters.length !== 1 && "s"} · {displayRows.length} categories
          {isOnline ? (
            <>
              {" "}
              · Room{" "}
              <span className="font-mono text-emerald-400/60">{roomCode}</span>
              {isFacilitator && " · You are the facilitator"}
            </>
          ) : (
            <>
              {" "}
              · Auto-saved to browser ·{" "}
              <span className="text-muted-foreground/30">
                Arrow keys to navigate column
              </span>
            </>
          )}
        </p>
      </motion.div>
    </div>
  );
}
