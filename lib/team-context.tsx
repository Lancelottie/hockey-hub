"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Team } from "./types";
import type { Role } from "./users";
import { canManage } from "./users";
import {
  clearStorage,
  exportDraft,
  hasUnsavedChanges,
  initializeStorage,
  loadTeams,
  storageStatus,
  subscribeStorage,
} from "./storage";
import type { Snapshot } from "./validation";
type Club = { id: string; name: string; role: Role; availableRoles: Role[] };
type Workspace = {
  club: Club;
  clubs: Club[];
  user: { id: string; name: string };
  data: Snapshot;
  revision: number;
};
type TeamContextValue = {
  teams: Team[];
  activeTeamId: string | null;
  activeTeam: Team | null;
  setActiveTeamId: (id: string) => void;
  club: Club;
  clubs: Club[];
  userId: string;
  userName: string;
  canWrite: boolean;
  switchClub: (id: string) => void;
  switchRole: (role: Role) => void;
};
const TeamContext = createContext<TeamContextValue | null>(null);
export function TeamProvider({ children }: { children: ReactNode }) {
  const pendingRequest = useRef<AbortController | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const status = useSyncExternalStore(
    subscribeStorage,
    storageStatus,
    () => "Loading workspace…",
  );
  const cancelLoad = useCallback(() => pendingRequest.current?.abort(), []);
  const load = useCallback(async (id?: string) => {
    pendingRequest.current?.abort();
    const controller = new AbortController();
    pendingRequest.current = controller;
    try {
      const response = await fetch(
        `/api/workspace${id ? `?clubId=${encodeURIComponent(id)}` : ""}`,
        { cache: "no-store", signal: controller.signal },
      );
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error);
      initializeStorage(
        result.data,
        result.club.id,
        result.revision,
        canManage(result.club.role),
      );
      setWorkspace(result);
      setActiveTeamId(result.data.teams[0]?.id ?? null);
      setError("");
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "Unable to load workspace.");
    }
  }, []);
  // State updates in load happen after the network response, not synchronously.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    return () => {
      cancelLoad();
      clearStorage();
    };
  }, [load, cancelLoad]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  function switchClub(id: string) {
    if (hasUnsavedChanges()) {
      setError("Save or export your draft and reload before switching clubs.");
      return;
    }
    setWorkspace(null);
    void load(id);
  }
  if (!workspace)
    return (
      <main className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold">CoCaptain</h1>
        <p role="status" className="my-6">
          {error || "Loading your club…"}
        </p>
        {error && <button onClick={() => void load()}>Try again</button>}
        <a className="ml-4 underline" href="/login">
          Sign in
        </a>
      </main>
    );
  const teams = loadTeams();
  const activeTeam =
    teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null;
  const clubId = workspace.club.id;
  async function switchRole(role: Role) {
    if (hasUnsavedChanges()) {
      setError("Save or export your draft and reload before switching roles.");
      return;
    }
    try {
      const response = await fetch("/api/active-role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, role }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to switch role.");
      setWorkspace(null);
      void load(clubId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to switch role.");
    }
  }
  return (
    <TeamContext.Provider
      value={{
        teams,
        activeTeamId: activeTeam?.id ?? null,
        activeTeam,
        setActiveTeamId: (id) => {
          if (teams.some((t) => t.id === id)) setActiveTeamId(id);
        },
        club: workspace.club,
        clubs: workspace.clubs,
        userId: workspace.user.id,
        userName: workspace.user.name,
        canWrite: canManage(workspace.club.role),
        switchClub,
        switchRole: (role) => void switchRole(role),
      }}
    >
      <div className="save-status" role="status" aria-live="polite">
        <span>{error || status}</span>
        {hasUnsavedChanges() && (
          <button onClick={exportDraft}>Export draft</button>
        )}
      </div>
      {children}
    </TeamContext.Provider>
  );
}
export function useTeam() {
  const context = useContext(TeamContext);
  if (!context) throw new Error("useTeam requires TeamProvider");
  return context;
}
