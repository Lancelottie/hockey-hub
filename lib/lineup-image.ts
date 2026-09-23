import { GOALKEEPER_COLORS, HOME_COLOR, AWAY_COLOR } from "./kit-colors";
import { formatFixtureLabel, formatMatchDateLong } from "./match-format";
import { generateSlots } from "./formation";
import type { Formation, Lineup, Match, Player } from "./types";

const CANVAS_W = 1080;
const HEADER_H = 220;
// The public pitch artwork is landscape (1608x978); the on-pitch view rotates it -90° into a
// portrait viewBox of 978x1608 — mirrored here so the shirt positions line up the same way.
const PITCH_ART_W = 1608;
const PITCH_ART_H = 978;
const PITCH_VIEWBOX_W = PITCH_ART_H;
const PITCH_VIEWBOX_H = PITCH_ART_W;
const PITCH_H = Math.round((CANVAS_W * PITCH_VIEWBOX_H) / PITCH_VIEWBOX_W);
const STARTER_RADIUS = 62;
const SUB_RADIUS = 44;
const SUB_COL_W = 250;
const SUB_ROW_H = 180;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
// Same glyph as lucide-react's <Shirt> icon (used on the pitch elsewhere in the app), on its
// native 24x24 viewBox so the drawn shirts match rather than falling back to plain circles.
const SHIRT_PATH = new Path2D(
  "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src}`));
    img.src = src;
  });
}

function drawShirt(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  player: Player | undefined,
  isGoalkeeper: boolean,
  isHome: boolean,
  ownTeamId: string,
) {
  const kit = player?.goalkeeperKit ?? "yellow";
  const color = isGoalkeeper ? GOALKEEPER_COLORS[kit] : isHome ? HOME_COLOR : AWAY_COLOR;
  const bottom = cy + radius * 0.92; // ~ the icon's bottom hem, for anchoring the name below it

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale((radius * 2) / 24, (radius * 2) / 24);
  ctx.translate(-12, -12);
  ctx.fillStyle = color;
  ctx.fill(SHIRT_PATH);
  ctx.lineJoin = "round";
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.stroke(SHIRT_PATH);
  ctx.restore();

  // The torso — where the number sits — is the narrower lower two-thirds of the icon, not
  // the full box: offset up from centre and undersize the digits so they stay inside it.
  const numberCx = cx - radius * 0.06;
  const numberCy = cy + radius * 0.28;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isGoalkeeper && kit === "yellow" ? "#142b3f" : "#ffffff";
  ctx.font = `700 ${Math.round(radius * 0.56)}px ${FONT}`;
  ctx.fillText(player ? String(player.number ?? "•") : "+", numberCx, numberCy);

  if (player) {
    const borrowed = player.teamId !== ownTeamId;
    const label = `${player.name.split(" ")[0]}${borrowed ? "*" : ""}`;
    ctx.font = `600 ${Math.round(radius * 0.46)}px ${FONT}`;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.round(radius * 0.18);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(label, cx, bottom + radius * 0.5);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, cx, bottom + radius * 0.5);
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

/** Renders the published lineup as a shareable PNG. Returns a data URL. */
export async function renderLineupImage(params: {
  teamName: string;
  match: Match;
  formation: Formation;
  lineup: Lineup;
  players: Player[];
}): Promise<string> {
  const { teamName, match, formation, lineup, players } = params;
  const slots = generateSlots(formation.lines, formation.name);
  const subs = lineup.subs
    .filter((id): id is string => Boolean(id))
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
  const subRows = subs.length ? Math.ceil(subs.length / 4) : 1;
  const footerH = 90 + subRows * SUB_ROW_H;

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = HEADER_H + PITCH_H + footerH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");

  // Header
  ctx.fillStyle = "#112940";
  ctx.fillRect(0, 0, CANVAS_W, HEADER_H);
  ctx.fillStyle = "#7fd9b6";
  ctx.font = `700 26px ${FONT}`;
  ctx.fillText("CoCaptain", 40, 48);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 44px ${FONT}`;
  ctx.fillText(formatFixtureLabel(teamName, match), 40, 116, CANVAS_W - 80);
  ctx.fillStyle = "#b9c8d8";
  ctx.font = `500 25px ${FONT}`;
  const subtitle = `${formatMatchDateLong(match.date)} · ${formation.name || formation.lines.join("-")} · ${match.isHome ? "HOME" : "AWAY"}`;
  ctx.fillText(subtitle, 40, 160, CANVAS_W - 80);

  // Pitch
  ctx.save();
  ctx.translate(0, HEADER_H);
  ctx.fillStyle = "#4868ad";
  ctx.fillRect(0, 0, CANVAS_W, PITCH_H);
  try {
    const pitchArt = await loadImage("/hockey-pitch-clean.png");
    ctx.save();
    const scale = CANVAS_W / PITCH_VIEWBOX_W;
    ctx.scale(scale, scale);
    ctx.translate(0, PITCH_VIEWBOX_H);
    ctx.rotate(-Math.PI / 2);
    ctx.drawImage(pitchArt, 0, 0, PITCH_ART_W, PITCH_ART_H);
    ctx.restore();
  } catch {
    // Plain pitch colour is a fine fallback if the artwork can't load.
  }
  for (const slot of slots) {
    if (slot.id === "gk" && formation.noKeeper) continue;
    const player = players.find((p) => p.id === formation.assignments[slot.id]);
    drawShirt(ctx, (slot.x / 100) * CANVAS_W, (slot.y / 100) * PITCH_H, STARTER_RADIUS, player, slot.id === "gk", match.isHome, match.teamId);
  }
  ctx.restore();

  // Substitutes
  const footerTop = HEADER_H + PITCH_H;
  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(0, footerTop, CANVAS_W, footerH);
  ctx.fillStyle = "#152c43";
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText("Substitutes", 40, footerTop + 48);
  if (subs.length === 0) {
    ctx.fillStyle = "#5b6b7c";
    ctx.font = `500 24px ${FONT}`;
    ctx.fillText("None named", 40, footerTop + 100);
  } else {
    subs.forEach((player, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const cx = 130 + col * SUB_COL_W;
      const cy = footerTop + 140 + row * SUB_ROW_H;
      drawShirt(ctx, cx, cy, SUB_RADIUS, player, false, match.isHome, match.teamId);
    });
  }

  return canvas.toDataURL("image/png");
}
