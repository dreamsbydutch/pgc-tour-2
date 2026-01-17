import * as React from "react";

const EMOJI_FLAGS: Record<string, string> = {
  USA: "🇺🇸",
  CAN: "🇨🇦",
  ENG: "🏴",
  SCO: "🏴",
  IRL: "🇮🇪",
  GER: "🇩🇪",
  FRA: "🇫🇷",
  ITA: "🇮🇹",
  SWE: "🇸🇪",
  NOR: "🇳🇴",
  DEN: "🇩🇰",
  FIN: "🇫🇮",
  JPN: "🇯🇵",
  KOR: "🇰🇷",
  AUS: "🇦🇺",
  RSA: "🇿🇦",
  ARG: "🇦🇷",
  COL: "🇨🇴",
  CHI: "🇨🇳",
  TPE: "🇹🇼",
  BEL: "🇧🇪",
  AUT: "🇦🇹",
  PHI: "🇵🇭",
  PUR: "🇵🇷",
  VEN: "🇻🇪",
};

export function getCountryFlagNode(
  code: string | null | undefined,
): React.ReactNode {
  if (!code) return null;
  const emoji = EMOJI_FLAGS[code];
  if (emoji) return <span aria-label={code}>{emoji}</span>;
  return <span className="text-xs font-semibold">{code}</span>;
}
