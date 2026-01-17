import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const ROOT = process.cwd();

const RAW_DIR = path.join(ROOT, ".convex-export", "raw");
const CLEAN_DIR = path.join(ROOT, ".convex-export", "clean");
const OUT_DIR = path.join(ROOT, ".convex-export", "backfill");

const TOURCARD_ALLOWED = [
  "displayName",
  "tourId",
  "seasonId",
  "memberId",
  "earnings",
  "points",
  "wins",
  "topTen",
  "topFive",
  "madeCut",
  "appearances",
  "playoff",
  "currentPosition",
  "updatedAt",
];

const TEAM_ALLOWED = [
  "tournamentId",
  "tourCardId",
  "golferIds",
  "earnings",
  "points",
  "makeCut",
  "position",
  "pastPosition",
  "score",
  "topTen",
  "topFive",
  "topThree",
  "win",
  "today",
  "thru",
  "round",
  "roundOneTeeTime",
  "roundOne",
  "roundTwoTeeTime",
  "roundTwo",
  "roundThreeTeeTime",
  "roundThree",
  "roundFourTeeTime",
  "roundFour",
  "updatedAt",
];

const RESERVED = ["_id", "_creationTime"];

/**
 * @param {string} filePath
 * @returns {Promise<any[]>}
 */
async function readJsonLines(filePath) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const rows = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed));
  }
  return rows;
}

/**
 * @param {string} filePath
 * @param {any[]} rows
 */
function writeJsonLines(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const text = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(filePath, text, "utf8");
}

/**
 * @param {Record<string, any>} doc
 * @param {Set<string>} allowed
 */
function pickAndDropNulls(doc, allowed) {
  const next = {};
  for (const k of RESERVED) {
    if (k in doc) next[k] = doc[k];
  }
  for (const k of allowed) {
    if (!(k in doc)) continue;
    const v = doc[k];
    if (v === null) continue;
    if (v === undefined) continue;
    next[k] = v;
  }
  return next;
}

/**
 * @param {any[]} oldTeams
 * @returns {Map<string, { memberOldId?: string }>}
 */
function indexOldDataByTourCardOldId(oldTeams) {
  const map = new Map();
  for (const t of oldTeams) {
    const tourCardOldId = t?.tourCardId;
    const memberOldId = t?.tourCard?.memberId;
    if (typeof tourCardOldId !== "string" || !tourCardOldId.trim()) continue;
    if (!map.has(tourCardOldId)) {
      map.set(tourCardOldId, {
        memberOldId: typeof memberOldId === "string" ? memberOldId : undefined,
      });
    }
  }
  return map;
}

/**
 * @param {any[]} rawMembers
 */
function buildMemberOldIdToEmail(rawMembers) {
  const map = new Map();
  for (const m of rawMembers) {
    const oldId = m?.oldId;
    const email = m?.email;
    if (typeof oldId !== "string" || !oldId.trim()) continue;
    if (typeof email !== "string" || !email.trim()) continue;
    map.set(oldId, email);
  }
  return map;
}

/**
 * @param {any[]} currentMembers
 */
function buildCurrentEmailToMemberId(currentMembers) {
  const map = new Map();
  for (const m of currentMembers) {
    const id = m?._id;
    const email = m?.email;
    if (typeof id !== "string" || !id.trim()) continue;
    if (typeof email !== "string" || !email.trim()) continue;
    map.set(email.toLowerCase(), id);
  }
  return map;
}

async function main() {
  const oldDataPath = path.join(ROOT, "oldData.json");

  if (!fs.existsSync(oldDataPath)) {
    throw new Error(`Missing ${oldDataPath}`);
  }

  const rawTourCardsPath = path.join(RAW_DIR, "tourCards", "documents.jsonl");
  const rawTeamsPath = path.join(RAW_DIR, "teams", "documents.jsonl");
  const rawMembersPath = path.join(RAW_DIR, "members", "documents.jsonl");

  const currentTourCardsPath = path.join(CLEAN_DIR, "tourCards", "documents.jsonl");
  const currentMembersPath = path.join(CLEAN_DIR, "members", "documents.jsonl");

  const [
    rawTourCards,
    rawTeams,
    rawMembers,
    currentTourCards,
    currentMembers,
  ] = await Promise.all([
    readJsonLines(rawTourCardsPath),
    readJsonLines(rawTeamsPath),
    readJsonLines(rawMembersPath),
    readJsonLines(currentTourCardsPath),
    readJsonLines(currentMembersPath),
  ]);

  const oldTeams = JSON.parse(fs.readFileSync(oldDataPath, "utf8"));
  const oldByTourCardOldId = indexOldDataByTourCardOldId(oldTeams);

  const memberOldIdToEmail = buildMemberOldIdToEmail(rawMembers);
  const emailToMemberId = buildCurrentEmailToMemberId(currentMembers);

  const existingTourCardIds = new Set(
    currentTourCards
      .map((t) => t?._id)
      .filter((id) => typeof id === "string"),
  );

  const missingRawTourCards = rawTourCards.filter(
    (t) => typeof t?._id === "string" && !existingTourCardIds.has(t._id),
  );

  const missingTourCardConvexIds = new Set(
    missingRawTourCards
      .map((t) => t?._id)
      .filter((id) => typeof id === "string"),
  );

  const missingTeams = rawTeams.filter(
    (t) => typeof t?.tourCardId === "string" && missingTourCardConvexIds.has(t.tourCardId),
  );

  const tourCardAllowed = new Set(TOURCARD_ALLOWED);
  const teamAllowed = new Set(TEAM_ALLOWED);

  let tourCardsMapped = 0;
  let tourCardsUnmapped = 0;
  let tourCardsNoOldId = 0;
  let tourCardsNoMemberOldId = 0;
  let tourCardsNoEmail = 0;
  let tourCardsNoCurrentMember = 0;

  const tourCardsToImport = [];
  for (const raw of missingRawTourCards) {
    const picked = pickAndDropNulls(raw, tourCardAllowed);

    const oldId = raw?.oldId;
    if (typeof oldId !== "string" || !oldId.trim()) {
      tourCardsNoOldId += 1;
      tourCardsUnmapped += 1;
      continue;
    }

    const oldInfo = oldByTourCardOldId.get(oldId);
    const memberOldId = oldInfo?.memberOldId;
    if (typeof memberOldId !== "string" || !memberOldId.trim()) {
      tourCardsNoMemberOldId += 1;
      tourCardsUnmapped += 1;
      continue;
    }

    const email = memberOldIdToEmail.get(memberOldId);
    if (typeof email !== "string" || !email.trim()) {
      tourCardsNoEmail += 1;
      tourCardsUnmapped += 1;
      continue;
    }

    const memberId = emailToMemberId.get(email.toLowerCase());
    if (typeof memberId !== "string" || !memberId.trim()) {
      tourCardsNoCurrentMember += 1;
      tourCardsUnmapped += 1;
      continue;
    }

    picked.memberId = memberId;
    tourCardsToImport.push(picked);
    tourCardsMapped += 1;
  }

  const teamsToImport = missingTeams.map((t) => pickAndDropNulls(t, teamAllowed));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outTourCards = path.join(OUT_DIR, "missingTourCards.jsonl");
  const outTeams = path.join(OUT_DIR, "missingTeams.jsonl");

  writeJsonLines(outTourCards, tourCardsToImport);
  writeJsonLines(outTeams, teamsToImport);

  const report = {
    rawTourCards: rawTourCards.length,
    currentTourCards: currentTourCards.length,
    missingRawTourCards: missingRawTourCards.length,
    rawTeams: rawTeams.length,
    currentTeams: fs.existsSync(path.join(CLEAN_DIR, "teams", "documents.jsonl"))
      ? (await readJsonLines(path.join(CLEAN_DIR, "teams", "documents.jsonl"))).length
      : undefined,
    missingTeams: missingTeams.length,
    tourCardsToImport: tourCardsToImport.length,
    teamsToImport: teamsToImport.length,
    mapping: {
      tourCardsMapped,
      tourCardsUnmapped,
      tourCardsNoOldId,
      tourCardsNoMemberOldId,
      tourCardsNoEmail,
      tourCardsNoCurrentMember,
    },
    outputs: {
      outTourCards,
      outTeams,
    },
  };

  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err) + "\n");
  process.exit(1);
});
