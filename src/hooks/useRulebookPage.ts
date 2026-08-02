import { useMemo, useState } from "react";

import { api, useQuery } from "@/convex";
import { ruleList } from "@/utils/rules";
import { buildRulebookPayoutsTiers, buildRulebookPointsTiers } from "@/utils";
import type { EnhancedTournamentDoc, TierDoc } from "convex/types/types";

export function useRulebookPage() {
  const view = useQuery(api.functions.seasons.getRulebookView);
  const tiers = view?.tiers as TierDoc[] | undefined;
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const pointsTiers = useMemo(() => buildRulebookPointsTiers(tiers), [tiers]);
  const payoutsTiers = useMemo(() => buildRulebookPayoutsTiers(tiers), [tiers]);
  if (view === undefined) return { kind: "loading" as const };
  return {
    kind: "ready" as const,
    expandedIndex,
    toggleIndex: (index: number) =>
      setExpandedIndex((previous) => (previous === index ? null : index)),
    sections: ruleList,
    seasonTournaments: view.tournaments as EnhancedTournamentDoc[],
    pointsTiers,
    payoutsTiers,
  };
}
