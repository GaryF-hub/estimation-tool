"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Download,
  BarChart3,
  Sparkles,
  RotateCcw,
  Link,
  Pencil,
  Copy,
  Check,
  Wifi,
  WifiOff,
  Users,
  Loader2,
} from "lucide-react";
import {
  EstimationSession,
  OnlineRoomState,
  DEFAULT_CATEGORIES,
} from "@/lib/types";
import { exportToExcel } from "@/lib/export-excel";
import { connectSocket, disconnectSocket, warmUpServer } from "@/lib/socket";
import type { Socket } from "socket.io-client";

// Consistent colors per stat type
const STAT_STYLES = {
  min: { text: "text-sky-400", bg: "bg-sky-500/10" },
  max: { text: "text-amber-400", bg: "bg-amber-500/10" },
  avg: { text: "text-emerald-400", bg: "bg-emerald-500/10" },
} as const;

// Active cell identifier
type ActiveCell = { rowIdx: number; voterId: string } | null;

type AppMode = "lobby" | "online";

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
  serverError,
}: {
  onCreateRoom: (voterName: string, ticketName: string) => void;
  onJoinRoom: (roomCode: string, voterName: string) => void;
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
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && createName.trim()) {
                  onCreateRoom(createName.trim(), createTicket.trim());
                }
              }}
              className="w-full bg-background/30 rounded-lg px-4 py-2.5 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
            <input
              type="text"
              placeholder="Ticket name (optional, e.g. PROJ-1234)"
              value={createTicket}
              onChange={(e) => setCreateTicket(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && createName.trim()) {
                  onCreateRoom(createName.trim(), createTicket.trim());
                }
              }}
              className="w-full bg-background/30 rounded-lg px-4 py-2.5 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
            />
            <button
              onClick={() => {
                if (!createName.trim()) {
                  setError("Enter your name to create a session");
                  return;
                }
                setError("");
                onCreateRoom(createName.trim(), createTicket.trim());
              }}
              className="w-full py-2.5 rounded-lg text-sm font-medium border transition-all bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border-emerald-500/30"
            >
              Create & Start
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
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full bg-background/30 rounded-lg px-4 py-2.5 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-colors uppercase tracking-widest text-center font-mono text-lg"
            />
            <input
              type="text"
              placeholder="Your name *"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && joinCode.trim() && joinName.trim()) {
                  onJoinRoom(joinCode.trim(), joinName.trim());
                }
              }}
              className="w-full bg-background/30 rounded-lg px-4 py-2.5 text-sm border border-border/30 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500 transition-colors"
            />
            <button
              onClick={() => {
                if (!joinCode.trim() || !joinName.trim()) {
                  setError("Enter room code and your name to join");
                  return;
                }
                setError("");
                onJoinRoom(joinCode.trim(), joinName.trim());
              }}
              className="w-full py-2.5 rounded-lg text-sm font-medium border transition-all bg-sky-600/20 text-sky-300 hover:bg-sky-600/30 border-sky-500/30"
            >
              Join Session
            </button>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {(error || serverError) && (
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

  // Shared UI state
  const [newRowCategory, setNewRowCategory] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const addRowRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showAddRow) addRowRef.current?.focus();
  }, [showAddRow]);

  // ── Pre-warm server on page load (silent) ───────────
  useEffect(() => {
    if (mode !== "lobby") return;
    warmUpServer();
  }, [mode]);

  // ── Socket cleanup on unmount ────────────────────────
  useEffect(() => {
    return () => {
      disconnectSocket();
    };
  }, []);

  // ── Online mode handlers ─────────────────────────────

  const [connecting, setConnecting] = useState(false);
  const [connectingAction, setConnectingAction] = useState<"create" | "join" | null>(null);

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
      setLobbyError("");

      // Immediately show the grid with optimistic state
      const tempVoterId = "temp-" + Math.random().toString(36).slice(2, 9);
      const optimisticState: OnlineRoomState = {
        code: "",
        ticketName: ticketName || "",
        ticketLink: "",
        voters: [{ id: tempVoterId, name: voterName, isFacilitator: true }],
        rows: DEFAULT_CATEGORIES.map((cat, i) => ({
          id: `temp-${i}`,
          category: cat,
          isDefault: true,
          votes: {},
        })),
        revealed: false,
      };

      setMode("online");
      setRoomCode("");
      setMyVoterId(tempVoterId);
      setIsFacilitator(true);
      setOnlineState(optimisticState);
      setConnecting(true);
      setConnectingAction("create");

      // Connect socket in background
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
            setConnectingAction(null);
            if (response.success) {
              setRoomCode(response.roomCode);
              setMyVoterId(response.voterId);
              setIsFacilitator(response.isFacilitator);
              setOnlineState(response.state);
            } else {
              // Failed — go back to lobby
              setMode("lobby");
              setLobbyError(response.error || "Failed to create room");
              disconnectSocket();
              socketRef.current = null;
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
          setConnectingAction(null);
          setMode("lobby");
          setLobbyError("Could not connect — please try again.");
          disconnectSocket();
          socketRef.current = null;
        });
        // Timeout after 45 seconds
        setTimeout(() => {
          if (!socket.connected) {
            setConnecting(false);
            setConnectingAction(null);
            setMode("lobby");
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
      setConnectingAction("join");
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
            setConnectingAction(null);
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
          setConnectingAction(null);
          setLobbyError("Could not connect — please try again.");
          disconnectSocket();
          socketRef.current = null;
        });
        setTimeout(() => {
          if (!socket.connected) {
            setConnecting(false);
            setConnectingAction(null);
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
    setConnecting(false);
    setConnectingAction(null);
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

  // ── Handlers ─────────────────────────────────────────

  const addRow = useCallback(() => {
    const category = newRowCategory.trim();
    if (!category) return;
    emitAddCategory(category);
    setNewRowCategory("");
    setShowAddRow(false);
  }, [newRowCategory, emitAddCategory]);

  const removeRow = useCallback(
    (rowId: string) => emitRemoveCategory(rowId),
    [emitRemoveCategory]
  );

  const commitVote = useCallback(
    (rowId: string, _voterId: string, value: number | null) => {
      emitVote(rowId, value);
    },
    [emitVote]
  );

  const navigateCell = useCallback(
    (currentRowIdx: number, voterId: string, direction: "up" | "down") => {
      const rowCount = onlineState?.rows.length ?? 0;
      const nextIdx =
        direction === "down" ? currentRowIdx + 1 : currentRowIdx - 1;
      if (nextIdx >= 0 && nextIdx < rowCount) {
        setActiveCell({ rowIdx: nextIdx, voterId });
      } else {
        setActiveCell(null);
      }
    },
    [onlineState?.rows.length]
  );

  const toggleAllVisibility = useCallback(() => {
    emitToggleReveal();
  }, [emitToggleReveal]);

  // ── Computed display data ────────────────────────────

  const revealed = onlineState?.revealed ?? false;

  const displayVoters: { id: string; name: string }[] =
    onlineState?.voters ?? [];

  const displayRows = (onlineState?.rows ?? []).map((r) => ({
    id: r.id,
    category: r.category,
    votes: r.votes,
    hidden: !onlineState!.revealed,
    isDefault: r.isDefault,
  }));

  const displayTicketName = onlineState?.ticketName ?? "";
  const displayTicketLink = onlineState?.ticketLink ?? "";

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

  const totalAvg = displayRows.reduce((sum: number, row) => {
    const stats = getRowStats(row);
    return sum + (stats.avg ?? 0);
  }, 0);

  // Build an EstimationSession for Excel export
  const getExportSession = (): EstimationSession => {
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
      <AnimatePresence mode="wait">
        {connecting ? (
          <motion.div
            key="connecting-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen flex items-center justify-center px-4"
          >
            <div className="text-center space-y-6">
              <div className="flex items-center justify-center gap-3 mb-2">
                <BarChart3 className="w-8 h-8 text-emerald-400" />
                <h1 className="text-4xl font-bold gradient-text">EstiMate</h1>
              </div>
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-muted-foreground text-sm">
                  {connectingAction === "create"
                    ? "Setting up your room..."
                    : "Joining session..."}
                </p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="lobby-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Lobby
              onCreateRoom={handleCreateRoom}
              onJoinRoom={handleJoinRoom}
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
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── Grid mode ─────────────────────────────────────────

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
        {/* Room code + connection status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {connecting ? (
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
            ) : connected ? (
              <Wifi className="w-4 h-4 text-emerald-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-rose-400" />
            )}
            {roomCode ? (
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
            ) : (
              <span className="text-xs text-amber-400/80">
                Connecting...
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {connecting
              ? "Setting up room..."
              : `${displayVoters.length} voter${displayVoters.length !== 1 ? "s" : ""} connected`}
          </span>
          <div className="w-px h-6 bg-border/40" />
        </div>

        {/* Ticket fields — facilitator only */}
        {isFacilitator ? (
          <div className="flex items-center gap-2 min-w-[280px]">
            <Link className="w-4 h-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              placeholder="Ticket name (e.g. PROJ-1234)"
              value={displayTicketName}
              onChange={(e) =>
                emitUpdateTicket(e.target.value, displayTicketLink)
              }
              className="bg-transparent border-b border-border/50 px-2 py-1 text-sm focus:outline-none focus:border-emerald-500 transition-colors w-40"
            />
            <input
              type="text"
              placeholder="Ticket URL (optional)"
              value={displayTicketLink}
              onChange={(e) =>
                emitUpdateTicket(displayTicketName, e.target.value)
              }
              className="bg-transparent border-b border-border/50 px-2 py-1 text-sm focus:outline-none focus:border-emerald-500 transition-colors w-[420px]"
            />
          </div>
        ) : displayTicketName ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link className="w-4 h-4 shrink-0" />
            <span>{displayTicketName}</span>
          </div>
        ) : null}

        {/* Buttons — pushed to far right */}
        <div className="flex items-center gap-2 flex-wrap ml-auto">
          {/* Reveal/Hide — facilitator only */}
          {isFacilitator && (
            <>
              <button
                onClick={toggleAllVisibility}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30"
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

          <div className="w-px h-6 bg-border/40 mx-1" />
          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 transition-all"
            title="Leave this session and return to lobby"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Leave
          </button>
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
                          voter.id === myVoterId
                            ? "text-emerald-200"
                            : "text-emerald-300"
                        }`}
                      >
                        {voter.name}
                        {voter.id === myVoterId && (
                          <span className="text-[10px] text-emerald-400/60 ml-1">
                            (you)
                          </span>
                        )}
                      </span>
                    </div>
                  </th>
                ))}
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
                          {isFacilitator && (
                            <button
                              onClick={() => removeRow(row.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-rose-400/60 hover:text-rose-400 shrink-0"
                              title="Remove row"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {editingCategory === row.id && isFacilitator ? (
                            <input
                              type="text"
                              value={row.category}
                              onChange={(e) =>
                                emitEditCategory(row.id, e.target.value)
                              }
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
                                if (isFacilitator) {
                                  setEditingCategory(row.id);
                                }
                              }}
                              className={`text-sm text-foreground/90 transition-colors ${
                                isFacilitator
                                  ? "cursor-pointer hover:text-emerald-300"
                                  : ""
                              }`}
                              title={
                                isFacilitator
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
                        const isMyColumn = voter.id === myVoterId;
                        const cellValue = row.votes[voter.id];

                        return (
                          <td
                            key={voter.id}
                            className="px-1 py-1.5 text-center"
                          >
                            <VoteCell
                              value={cellValue}
                              hidden={false}
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

              {/* Add row — facilitator only */}
              {isFacilitator && (
                <tr className="border-t border-border/30">
                  <td
                    colSpan={displayVoters.length + 4}
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
          {" "}· Room{" "}
          <span className="font-mono text-emerald-400/60">{roomCode}</span>
          {isFacilitator && " · You are the facilitator"}
        </p>
      </motion.div>
    </div>
  );
}
