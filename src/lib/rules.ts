/**
 * Rulebook Data
 *
 * Contains the static data for the rulebook, including categories and rules.
 */
export const ruleList: {
  category: string;
  rules: {
    ruleText: string;
    details?: string[];
  }[];
  picture?: {
    url: string;
    altText: string;
  };
}[] = [
  {
    category: "Schedule",
    rules: [
      {
        ruleText:
          "The PGC Tour schedule consists of the top 16 tournaments on the PGA Tour schedule.",
      },
      {
        ruleText:
          "These 16 tournaments are split into three categories: Majors, Elevated, and Standard.",
      },
      {
        ruleText: "Major Tournaments",
        details: [
          "The Masters, PGA Championship, U.S. Open, The Open Championship",
        ],
      },
      {
        ruleText: "Elevated Events",
        details: [
          "The Genesis Invitational, Arnold Palmer Invitational, The Players Championship, RBC Heritage, The Memorial Tournament, Travelers Championship",
        ],
      },
      {
        ruleText: "Standard Events",
        details: [
          "Waste Management Open, Texas Children's Houston Open, Truist Championship, RBC Canadian Open, Rocket Mortgage Classic, Genesis Scottish Open",
        ],
      },
      {
        ruleText:
          "Each tier of tournaments has a different points and payouts structure.",
      },
    ],
  },
  {
    category: "Rosters",
    rules: [
      {
        ruleText:
          "The field for each tournament will be split into five groups. Groups are finalized the Monday morning prior to each tournament.",
        details: [
          "Until further notice, Scottie Scheffler has been removed from play for being unhuman.",
        ],
      },
      {
        ruleText:
          "Players choose 2 golfers from each of the 5 groups to create their 10-golfer team for the tournament. New teams are created prior to each tournament on the schedule.",
      },
      {
        ruleText:
          "Golfers that are added to the PGA tournament field after the groups are set will be left out of the PGC field.",
      },
      {
        ruleText:
          "If a golfer withdraws prior to hitting their first tee shot of the tournament and remains on your roster when the tournament begins, that golfer will be replaced with the best available golfer from the same group, based on world ranking.",
      },
    ],
  },
  {
    category: "Scoring",
    rules: [
      {
        ruleText:
          "During rounds 1 and 2 of the tournament, each team's score will be the average scores of all 10 golfers on your team.",
        details: ["Each PGA stroke equates to 0.1 PGC strokes."],
      },
      {
        ruleText:
          "During rounds 3 and 4 of the tournament, each team's score will be the average scores of the 5 lowest golfers on your team that day.",
        details: ["Each PGA stroke equates to 0.2 PGC strokes."],
      },
      {
        ruleText:
          "Teams must have 5 golfers make the weekend PGA cut or that team will be cut from the PGC tournament.",
      },
      {
        ruleText:
          "Any golfer that withdraws from the tournament prior to cut day will receive a score of 8-over par for any round they did not complete up until cut day. Any golfer that withdraws after cut day receives a score of 8-over par for any incomplete rounds and then are considered CUT on the days they do not participate at all.",
      },
      {
        ruleText:
          "After each tournament throughout the season, the top 35 finishers will receive PGC Playoff Points. Each tournament will distribute points based on the tournament's tier.",
      },
    ],
  },
  {
    category: "Playoffs",
    rules: [
      {
        ruleText:
          "At the end of the regular season, the top 15 players on each tour qualify for the PGC Gold Playoff tournament, and the next 20 players on each tour qualify for the PGC Silver Playoff Tournament.",
      },
      {
        ruleText:
          "The winner of the PGC Gold Playoff will be crowned PGC Champion for the year. The PGC Silver Playoff is just for bonus money and bragging rights.",
      },
      {
        ruleText:
          "Each PGC Playoff tournament is 12 rounds long and played across all three FedEx Cup Playoff events (FedEx-St. Jude Championship, BMW Championship, TOUR Championship).",
      },
      {
        ruleText:
          "Players that qualify will pick their 10-golfer team for the entire three-week tournament prior to the first event.",
      },
      {
        ruleText:
          "Each team will start the playoffs with a set number of strokes based on their point total in the PGC standings.",
      },
      {
        ruleText:
          "The FedEx-St. Jude Championship runs just like a normal tournament.",
      },
      {
        ruleText:
          "The BMW Championship only counts your top 5 golfers in each of the 4 rounds.",
      },
      {
        ruleText:
          "The TOUR Championship only counts your top 3 golfers in each of the 4 rounds.",
      },
    ],
  },
  {
    category: "Payouts",
    rules: [
      {
        ruleText:
          "After each tournament, the top finishers will earn money. Earnings accumulate throughout the season and will be paid out at the end of the year.",
      },
      {
        ruleText:
          "Payout structures for each tournament are based on the tournament's tier and will be finalized once sign-ups are completed.",
      },
      {
        ruleText:
          "Once the season has completed you are able to request your winnings via e-transfer within your member page. The member page can be found by clicking on your profile icon on the nav bar.",
      },
    ],
  },
];
