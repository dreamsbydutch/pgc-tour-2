import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { ruleList } from "../data/rules";
import { cn } from "../lib/utils";
import { LeagueSchedule } from "../components/schedule/LeagueSchedule";
import { PayoutsTable, PointsTable } from "../components/TierTables";

export const Route = createFileRoute("/rulebook")({
  component: Rulebook,
});

function Rulebook() {
  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-6xl">
        <div className="pb-4 pt-2 text-center font-yellowtail text-6xl lg:text-7xl">
          Rulebook
        </div>
        <div className="mx-auto mb-8 w-full border-b-2 border-gray-600"></div>

        {ruleList.map((section, i) => (
          <RuleCategory key={i} ruleData={section} index={i} />
        ))}
      </div>
    </div>
  );
}

/**
 * RuleCategory Component
 *
 * Displays a collapsible section of the rulebook.
 */
function RuleCategory({
  ruleData,
  index,
}: {
  ruleData: {
    category: string;
    rules: {
      ruleText: string;
      details?: string[];
    }[];
    picture?: {
      url: string;
      altText: string;
    };
  };
  index: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mx-auto border-b-2 border-gray-500">
      <button
        className="flex w-full flex-row justify-center gap-2 py-5 text-center font-varela text-2xl font-bold transition-colors hover:bg-gray-50 xs:text-3xl md:text-4xl"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div>{ruleData.category}</div>
        <div className="self-center">
          {isExpanded ? (
            <ChevronUp className="h-6 w-6" />
          ) : (
            <ChevronDown className="h-6 w-6" />
          )}
        </div>
      </button>

      <div className={cn("hidden pb-8", isExpanded && "block")}>
        {ruleData.rules.map((rule, ruleIndex) => (
          <div key={`${index}.${ruleIndex}`} className="py-2">
            <div className="text-center text-base xs:text-lg md:text-xl">
              {rule.ruleText}
            </div>
            {rule.details && (
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
            )}
          </div>
        ))}

        {ruleData.category === "Schedule" && (
          <div className="mt-6">
            <LeagueSchedule />
          </div>
        )}

        {ruleData.category === "Payouts" && (
          <div className="mt-6">
            <PayoutsTable />
          </div>
        )}

        {ruleData.category === "Scoring" && (
          <div className="mt-6">
            <PointsTable />
          </div>
        )}
      </div>
    </div>
  );
}
