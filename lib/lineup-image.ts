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
const SUB_ROW_H = 150;
const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";

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
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = isGoalkeeper && kit === "yellow" ? "#142b3f" : "#ffffff";
  ctx.font = `700 ${Math.round(radius * 0.72)}px ${FONT}`;
  ctx.fillText(player ? String(player.number ?? "•") : "+", cx, cy + radius * 0.04);

  if (player) {
    const borrowed = player.teamId !== ownTeamId;
    const label = `${player.name.split(" ")[0]}${borrowed ? "*" : ""}`;
    ctx.font = `600 ${Math.round(radius * 0.5)}px ${FONT}`;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.round(radius * 0.18);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.strokeText(label, cx, cy + radius + radius * 0.62);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, cx, cy + radius + radius * 0.62);
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
    const player = players.find((p) => p.id === formation.assignments[slot.id]);
    drawShirt(ctx, (slot.x / 100) * CANVAS_W, (slot.y / 100) * PITCH_H, 46, player, slot.id === "gk", match.isHome, match.teamId);
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
      const cx = 110 + col * 240;
      const cy = footerTop + 130 + row * SUB_ROW_H;
      drawShirt(ctx, cx, cy, 34, player, false, match.isHome, match.teamId);
    });
  }

  return canvas.toDataURL("image/png");
}
