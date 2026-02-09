import { createFileRoute } from "@tanstack/react-router";

import { LeagueSchedule } from "@/components/displays";
import { TierDistributionsTable } from "@/components/displays";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn, ruleList, TierPayoutsRow, TierPointsRow } from "@/lib";
import { useMemo, useState } from "react";
import { api, useQuery } from "@/convex";
import { EnhancedTournamentDoc, TierDoc } from "convex/types/types";

export const Route = createFileRoute("/rulebook")({
  component: Rulebook,
});

function Rulebook() {
  const model = useRulebookPage();

  if (model.kind === "loading") {
    return <RulebookPageSkeleton />;
  }

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-6xl">
        <div className="pb-4 pt-2 text-center font-yellowtail text-6xl lg:text-7xl">
          Rulebook
        </div>
        <div className="mx-auto mb-8 w-full border-b-2 border-gray-600" />

        {model.sections.map((section, index) => {
          const isExpanded = model.expandedIndex === index;

          return (
            <div key={index} className="mx-auto border-b-2 border-gray-500">
              <button
                className="flex w-full flex-row justify-center gap-2 py-5 text-center font-varela text-2xl font-bold transition-colors hover:bg-gray-50 xs:text-3xl md:text-4xl"
                onClick={() => model.toggleIndex(index)}
                type="button"
              >
                <div>{section.category}</div>
                <div className="self-center">
                  {isExpanded ? (
                    <ChevronUp className="h-6 w-6" />
                  ) : (
                    <ChevronDown className="h-6 w-6" />
                  )}
                </div>
              </button>

              <div className={cn("hidden pb-8", isExpanded && "block")}>
                {section.rules.map((rule, ruleIndex) => (
                  <div key={`${index}.${ruleIndex}`} className="py-2">
                    <div className="text-center text-base xs:text-lg md:text-xl">
                      {rule.ruleText}
                    </div>
                    {rule.details ? (
                      <ul className="space-y-1 pt-1">
                        {rule.details.map((detail, detailIndex) => (
                          <li
                            key={`${index + 1}.${ruleIndex + 1}.${detailIndex + 1}`}
                            className="py-1 text-center text-sm text-gray-600 xs:text-base md:text-base"
                          >
                            {detail}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}

                {section.category === "Schedule" && model.seasonTournaments ? (
                  <div className="mt-6">
                    <LeagueSchedule tournaments={model.seasonTournaments} />
                  </div>
                ) : null}

                {section.category === "Payouts" ? (
                  <div className="mt-6">
                    <TierDistributionsTable
                      kind="payouts"
                      tiers={model.payoutsTiers}
                      loading={model.isLoading}
                    />
                  </div>
                ) : null}

                {section.category === "Scoring" ? (
                  <div className="mt-6">
                    <TierDistributionsTable
                      kind="points"
                      tiers={model.pointsTiers}
                      loading={model.isLoading}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Builds the rulebook page view model.
 *
 * Inputs:
 * - none
 *
 * Derived state:
 * - `expandedIndex` indicates which section is expanded
 * - `toggleIndex` toggles expanded/collapsed
 * - `sections` are memoized from the static `ruleList`
 */
function useRulebookPage():
  | {
      kind: "ready";
      expandedIndex: number | null;
      toggleIndex: (index: number) => void;
      sections: typeof ruleList;
      seasonTournaments: EnhancedTournamentDoc[] | undefined;
      pointsTiers: TierPointsRow[];
      payoutsTiers: TierPayoutsRow[];
      isLoading: boolean;
    }
  | { kind: "loading" } {
  const season = useQuery(api.functions.seasons.getCurrentSeason);
  const tiers = useQuery(
    api.functions.tiers.getTiers,
    season ? { options: { filter: { seasonId: season._id } } } : "skip",
  ) as TierDoc[] | undefined;
  const seasonTournaments = useQuery(
    api.functions.tournaments.getTournaments,
    season
      ? {
          options: {
            filter: { seasonId: season._id },
            sort: { sortBy: "startDate", sortOrder: "asc" },
            enhance: { includeCourse: true, includeTier: true },
          },
        }
      : "skip",
  ) as EnhancedTournamentDoc[] | undefined;
  const sections = useMemo(() => ruleList, []);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleIndex = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  const pointsTiers = useMemo((): TierPointsRow[] => {
    if (!tiers || tiers.length === 0) return [];

    const tierRows = tiers.map((tier) => ({
      key: String(tier._id),
      name: tier.name,
      points: tier.points,
    }));

    const tierOrder = ["Standard", "Elevated", "Major"];
    return [...tierRows]
      .filter((tier) => tierOrder.includes(tier.name))
      .sort((a, b) => tierOrder.indexOf(a.name) - tierOrder.indexOf(b.name));
  }, [tiers]);

  const payoutsTiers = useMemo((): TierPayoutsRow[] => {
    if (!tiers || tiers.length === 0) return [];

    const tierRows = tiers.map((tier) => ({
      key: String(tier._id),
      name: tier.name,
      payouts: tier.payouts,
    }));

    const tierOrder = ["Standard", "Elevated", "Major", "Playoff"];
    const sorted = [...tierRows].sort(
      (a, b) => tierOrder.indexOf(a.name) - tierOrder.indexOf(b.name),
    );

    const playoffTier = sorted.find((t) => t.name === "Playoff");
    const next = [...sorted];

    if (playoffTier && playoffTier.payouts.length > 75) {
      const silverTier: TierPayoutsRow = {
        ...playoffTier,
        key: "silver-tier",
        name: "Silver",
        payouts: playoffTier.payouts.slice(75),
      };

      const playoffIndex = next.findIndex((t) => t.name === "Playoff");
      next.splice(playoffIndex + 1, 0, silverTier);
    }

    return next;
  }, [tiers]);

  return {
    kind: "ready",
    expandedIndex,
    toggleIndex,
    sections,
    seasonTournaments,
    pointsTiers,
    payoutsTiers,
    isLoading: tiers === undefined,
  };
}

/**
 * Skeleton UI for the rulebook page.
 */
function RulebookPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-10 w-48 rounded-md bg-muted" />
        <div className="h-24 w-full rounded-md bg-muted" />
        <div className="h-24 w-full rounded-md bg-muted" />
        <div className="h-24 w-full rounded-md bg-muted" />
      </div>
    </div>
  );
}
