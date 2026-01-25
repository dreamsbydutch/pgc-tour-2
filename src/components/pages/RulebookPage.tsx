import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { LeagueSchedule } from "@/ui";
import { useRulebookTierTables } from "@/hooks";
import { TierDistributionsTable } from "@/ui";
import { ruleList } from "@/lib/rules";
import { cn } from "@/lib/utils";

/**
 * Renders the league rulebook.
 *
 * This page displays the static `ruleList` as collapsible sections.
 * It manages expanded/collapsed state client-side and renders a few
 * special sections with embedded components (schedule, payouts, scoring).
 *
 * @returns The rulebook UI for the `/rulebook` route.
 */
export function RulebookPage() {
  const model = useRulebookPage();
  const tiersModel = useRulebookTierTables();

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

                {section.category === "Schedule" ? (
                  <div className="mt-6">
                    <LeagueSchedule />
                  </div>
                ) : null}

                {section.category === "Payouts" ? (
                  <div className="mt-6">
                    <TierDistributionsTable
                      kind="payouts"
                      tiers={tiersModel.payoutsTiers}
                      loading={tiersModel.isLoading}
                    />
                  </div>
                ) : null}

                {section.category === "Scoring" ? (
                  <div className="mt-6">
                    <TierDistributionsTable
                      kind="points"
                      tiers={tiersModel.pointsTiers}
                      loading={tiersModel.isLoading}
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
    }
  | { kind: "loading" } {
  const sections = useMemo(() => ruleList, []);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const toggleIndex = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  return { kind: "ready", expandedIndex, toggleIndex, sections };
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
