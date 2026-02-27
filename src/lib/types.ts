export interface Voter {
  id: string;
  name: string;
}

export interface EstimationRow {
  id: string;
  category: string;
  votes: Record<string, number | null>; // voterId -> days
  hidden: boolean; // eye toggle - hide individual scores
  isDefault: boolean; // pre-defined vs custom
}

export interface EstimationSession {
  id: string;
  ticketLink: string;
  ticketName: string;
  voters: Voter[];
  rows: EstimationRow[];
  createdAt: string;
}

// ── Online / multi-user types ──────────────────────────

export interface OnlineVoter {
  id: string;
  name: string;
  isFacilitator: boolean;
}

export interface OnlineRow {
  id: string;
  category: string;
  isDefault: boolean;
  votes: Record<string, number | null | "hidden">;
}

export interface OnlineRoomState {
  code: string;
  ticketName: string;
  ticketLink: string;
  voters: OnlineVoter[];
  rows: OnlineRow[];
  revealed: boolean;
}

export const DEFAULT_CATEGORIES = [
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
