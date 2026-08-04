import { ChevronDown, ChevronUp } from "lucide-react";

import { LeagueSchedule, TierDistributionsTable } from "@/displays";
import { useRulebookPage } from "@/hooks";
import { cn } from "@/utils/app";

export function RulebookPage() {
  const model = useRulebookPage();

  if (model.kind === "loading") return <RulebookPageSkeleton />;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="pb-4 pt-2 text-center font-yellowtail text-5xl sm:text-6xl lg:text-7xl">
          Rulebook
        </h1>
        <div className="mx-auto mb-8 w-full border-b-2 border-gray-600" />

        {model.sections.map((section, index) => {
          const isExpanded = model.expandedIndex === index;
          return (
            <div
              key={section.category}
              className="mx-auto border-b-2 border-gray-500"
            >
              <button
                className="flex min-h-11 w-full flex-row justify-center gap-2 py-5 text-center font-varela text-2xl font-bold transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xs:text-3xl md:text-4xl"
                onClick={() => model.toggleIndex(index)}
                type="button"
                aria-expanded={isExpanded}
              >
                <span>{section.category}</span>
                {isExpanded ? (
                  <ChevronUp
                    className="h-6 w-6 self-center"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronDown
                    className="h-6 w-6 self-center"
                    aria-hidden="true"
                  />
                )}
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
                      loading={false}
                    />
                  </div>
                ) : null}
                {section.category === "Scoring" ? (
                  <div className="mt-6">
                    <TierDistributionsTable
                      kind="points"
                      tiers={model.pointsTiers}
                      loading={false}
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

function RulebookPageSkeleton() {
  return (
    <div
      className="container mx-auto px-4 py-8"
      aria-busy="true"
      aria-label="Loading rulebook"
    >
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-10 w-48 rounded-md bg-muted" />
        <div className="h-24 w-full rounded-md bg-muted" />
        <div className="h-24 w-full rounded-md bg-muted" />
        <div className="h-24 w-full rounded-md bg-muted" />
      </div>
    </div>
  );
}
