export type PlayerPosition =
  "Goalkeeper" | "Defender" | "Midfielder" | "Forward";

export type GoalkeeperKit = "yellow" | "black" | "purple";

export type Team = {
  id: string;
  name: string;
  formationPresets?: FormationPreset[];
};

export type Player = {
  id: string;
  teamId: string;
  name: string;
  number: number | null;
  position: PlayerPosition;
  goalkeeperKit?: GoalkeeperKit;
};

export type Match = {
  id: string;
  teamId: string;
  opponent: string;
  date: string;
  isHome: boolean;
  externalSource?: "england-hockey";
  externalKey?: string;
  externalFixtureId?: string;
  externalTeamId?: string;
  startTime?: string | null;
  homeTeam?: string;
  awayTeam?: string;
  venue?: string;
  competition?: string;
  status?: string;
  sourceUrl?: string;
  lastSyncedAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PitchPlacement = {
  playerId: string;
  x: number;
  y: number;
};

export type FormationPreset = { name: string; lines: number[] };
export type Formation = FormationPreset & {
  status: "draft" | "published";
  assignments: Record<string, string>;
  noKeeper?: boolean;
  /** Overrides the default home-blue/away-red shirt colour on the pitch diagram. */
  kitColor?: "blue" | "red";
};

export type Lineup = {
  formation?: Formation;
  placements: PitchPlacement[];
  subs: (string | null)[];
};

export type CaptainTask = {
  done: boolean;
  answer: string;
};

export type CaptainTaskChecklist = {
  pushback: CaptainTask;
  warmupStart: CaptainTask;
  northernKit: CaptainTask;
  oppositionKit: CaptainTask;
  teas: CaptainTask;
  lifts: CaptainTask;
  notable: CaptainTask;
  keepersKit: CaptainTask;
  firstAidKit: CaptainTask;
  awayBalls: CaptainTask;
  umpires: CaptainTask;
  gmsUpdated: CaptainTask;
};

export type PostMatchReview = {
  ourScore: string;
  oppositionScore: string;
  goalscorers: string;
  assists: string;
  summary: string;
  womanOfTheMatchPlayerId: string;
  playerFeedback: Record<string, string>;
};

export type SquadTier = "1s" | "2s" | "Development";

export type PlayerAssessment = {
  attending: boolean;
  fitness: number;
  passingBall: number;
  receivingBall: number;
  defending: number;
  attackingPlay: number;
  transition: number;
  attitudeCommitment: number;
  teamworkCommunication: number;
  lastSeasonTeam: SquadTier;
};
