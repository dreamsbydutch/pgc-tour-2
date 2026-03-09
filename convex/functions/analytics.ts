import { v } from "convex/values";
import { internalAction } from "../_generated/server";

const posthogHost = (
  process.env.POSTHOG_HOST ?? "https://us.i.posthog.com"
).replace(/\/$/, "");
const posthogKey = process.env.POSTHOG_API_KEY;

const propertyValue = v.union(v.string(), v.number(), v.boolean(), v.null());

export const captureEvent = internalAction({
  args: {
    event: v.string(),
    distinctId: v.string(),
    properties: v.optional(v.record(v.string(), propertyValue)),
  },
  handler: async (_ctx, args) => {
    if (!posthogKey) {
      return { ok: false as const, skipped: true as const };
    }

    const response = await fetch(`${posthogHost}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: posthogKey,
        event: args.event,
        distinct_id: args.distinctId,
        properties: args.properties ?? {},
      }),
    });

    return { ok: response.ok as boolean };
  },
});
