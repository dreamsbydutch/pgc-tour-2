const SUBDIVISION_FLAGS: Record<string, string> = {
  ENG: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  ENGLAND: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  SCO: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  SCOTLAND: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
  WAL: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
  WALES: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
};

// The golf feeds use a small, stable mix of ISO codes and display names. Keeping
// that vocabulary here avoids shipping the complete ISO country database.
const COUNTRY_ALPHA_2: Record<string, string> = {
  ARG: "AR",
  ARGENTINA: "AR",
  AUS: "AU",
  AUSTRALIA: "AU",
  AUT: "AT",
  AUSTRIA: "AT",
  BEL: "BE",
  BELGIUM: "BE",
  BRA: "BR",
  BRAZIL: "BR",
  CAN: "CA",
  CANADA: "CA",
  CHI: "CN",
  CHINA: "CN",
  CHL: "CL",
  CHILE: "CL",
  COL: "CO",
  COLOMBIA: "CO",
  "CZECH REPUBLIC": "CZ",
  CZECHIA: "CZ",
  DEN: "DK",
  DENMARK: "DK",
  FIN: "FI",
  FINLAND: "FI",
  FRA: "FR",
  FRANCE: "FR",
  GER: "DE",
  GERMANY: "DE",
  GBR: "GB",
  "GREAT BRITAIN": "GB",
  UK: "GB",
  "U.K": "GB",
  "UNITED KINGDOM": "GB",
  IND: "IN",
  INDIA: "IN",
  IRL: "IE",
  IRELAND: "IE",
  "NORTHERN IRELAND": "GB",
  ITA: "IT",
  ITALY: "IT",
  JPN: "JP",
  JAPAN: "JP",
  KOR: "KR",
  "SOUTH KOREA": "KR",
  "KOREA, REPUBLIC OF": "KR",
  MEX: "MX",
  MEXICO: "MX",
  NED: "NL",
  NETHERLANDS: "NL",
  NOR: "NO",
  NORWAY: "NO",
  NZL: "NZ",
  "NEW ZEALAND": "NZ",
  PHI: "PH",
  PHILIPPINES: "PH",
  POR: "PT",
  PORTUGAL: "PT",
  PUR: "PR",
  "PUERTO RICO": "PR",
  RSA: "ZA",
  "SOUTH AFRICA": "ZA",
  ESP: "ES",
  SPAIN: "ES",
  SWE: "SE",
  SWEDEN: "SE",
  SUI: "CH",
  SWITZERLAND: "CH",
  THA: "TH",
  THAILAND: "TH",
  TPE: "TW",
  TAIWAN: "TW",
  "CHINESE TAIPEI": "TW",
  UAE: "AE",
  "UNITED ARAB EMIRATES": "AE",
  USA: "US",
  US: "US",
  "U.S": "US",
  "UNITED STATES": "US",
  "UNITED STATES OF AMERICA": "US",
  VEN: "VE",
  VENEZUELA: "VE",
};

function normalizeCountry(country: string): string {
  return country
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim()
    .toUpperCase()
    .replace(/\.$/, "");
}

function iso2ToFlagEmoji(iso2: string): string {
  const regionalIndicatorA = 0x1f1e6;
  const asciiA = "A".charCodeAt(0);
  return String.fromCodePoint(
    ...[...iso2].map(
      (letter) => regionalIndicatorA + letter.charCodeAt(0) - asciiA,
    ),
  );
}

export function getCountryFlagEmoji(
  country: string | null | undefined,
): string | null {
  if (!country) return null;

  const normalized = normalizeCountry(country);
  if (!normalized) return null;

  const subdivisionFlag = SUBDIVISION_FLAGS[normalized];
  if (subdivisionFlag) return subdivisionFlag;

  const alpha2 = /^[A-Z]{2}$/.test(normalized)
    ? normalized
    : COUNTRY_ALPHA_2[normalized];
  return alpha2 ? iso2ToFlagEmoji(alpha2) : null;
}
