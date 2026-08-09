"use node";

import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  hkdfSync,
  randomBytes,
  sign,
} from "node:crypto";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalAction } from "../_generated/server";

type ClaimedDelivery = {
  deliveryId: Id<"notificationDeliveries">;
  leaseToken: string;
  attempts: number;
  notification: {
    id: Id<"notifications">;
    title: string;
    body: string;
    href: string;
    category: string;
  };
  subscription: {
    id: Id<"pushSubscriptions">;
    endpoint: string;
    p256dh: string;
    auth: string;
  };
};

type DeliveryResult =
  | { skipped: true; reason: "vapid_not_configured" }
  | { skipped: false; attempted: number };

export const deliverPending: ReturnType<typeof internalAction> = internalAction(
  {
    args: {},
    handler: async (ctx): Promise<DeliveryResult> => {
      const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
      const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
      const subject = process.env.VAPID_SUBJECT?.trim();
      if (!publicKey || !privateKey || !subject) {
        console.warn("Push delivery skipped because VAPID is not configured");
        return { skipped: true, reason: "vapid_not_configured" } as const;
      }
      const deliveries = (await ctx.runMutation(
        internal.functions.notifications.claimPendingDeliveries,
        {},
      )) as ClaimedDelivery[];
      for (const delivery of deliveries) {
        try {
          await sendWebPush({
            subscription: delivery.subscription,
            payload: JSON.stringify({
              title: delivery.notification.title,
              body: delivery.notification.body,
              url: delivery.notification.href,
              tag: `${delivery.notification.category}:${delivery.notification.id}`,
            }),
            vapid: { publicKey, privateKey, subject },
          });
          await ctx.runMutation(
            internal.functions.notifications.finalizeDelivery,
            {
              deliveryId: delivery.deliveryId,
              leaseToken: delivery.leaseToken,
              outcome: "sent",
            },
          );
        } catch (error) {
          const statusCode = getStatusCode(error);
          const message =
            error instanceof Error ? error.message : String(error);
          await ctx.runMutation(
            internal.functions.notifications.finalizeDelivery,
            {
              deliveryId: delivery.deliveryId,
              leaseToken: delivery.leaseToken,
              outcome:
                statusCode === 404 || statusCode === 410
                  ? "expired"
                  : statusCode === 429 ||
                      (statusCode !== null && statusCode >= 500)
                    ? "retry"
                    : "failed",
              error: message,
            },
          );
        }
      }
      if (deliveries.length === 50) {
        await ctx.scheduler.runAfter(
          0,
          internal.functions.pushDelivery.deliverPending,
          {},
        );
      }
      return { skipped: false, attempted: deliveries.length } as const;
    },
  },
);

function getStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

async function sendWebPush(args: {
  subscription: { endpoint: string; p256dh: string; auth: string };
  payload: string;
  vapid: { publicKey: string; privateKey: string; subject: string };
}) {
  const body = encryptPayload({
    payload: Buffer.from(args.payload),
    userPublicKey: fromBase64Url(args.subscription.p256dh),
    authSecret: fromBase64Url(args.subscription.auth),
  });
  const authorization = createVapidAuthorization({
    endpoint: args.subscription.endpoint,
    ...args.vapid,
  });
  const response = await fetch(args.subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(24 * 60 * 60),
      Urgency: "normal",
    },
    body,
  });
  if (!response.ok) {
    const error = new Error(
      `Push service returned ${response.status}`,
    ) as Error & {
      statusCode: number;
    };
    error.statusCode = response.status;
    throw error;
  }
}

function encryptPayload(args: {
  payload: Buffer;
  userPublicKey: Buffer;
  authSecret: Buffer;
}) {
  if (args.userPublicKey.length !== 65 || args.userPublicKey[0] !== 4) {
    throw new Error("Invalid P-256 push subscription key");
  }
  const sender = createECDH("prime256v1");
  sender.generateKeys();
  const senderPublicKey = sender.getPublicKey();
  const sharedSecret = sender.computeSecret(args.userPublicKey);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    args.userPublicKey,
    senderPublicKey,
  ]);
  const inputKeyMaterial = Buffer.from(
    hkdfSync("sha256", sharedSecret, args.authSecret, keyInfo, 32),
  );
  const salt = randomBytes(16);
  const contentEncryptionKey = Buffer.from(
    hkdfSync(
      "sha256",
      inputKeyMaterial,
      salt,
      Buffer.from("Content-Encoding: aes128gcm\0"),
      16,
    ),
  );
  const nonce = Buffer.from(
    hkdfSync(
      "sha256",
      inputKeyMaterial,
      salt,
      Buffer.from("Content-Encoding: nonce\0"),
      12,
    ),
  );
  const plaintext = Buffer.concat([args.payload, Buffer.from([2])]);
  const cipher = createCipheriv("aes-128-gcm", contentEncryptionKey, nonce);
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([senderPublicKey.length]),
    senderPublicKey,
    encrypted,
  ]);
}

function createVapidAuthorization(args: {
  endpoint: string;
  publicKey: string;
  privateKey: string;
  subject: string;
}) {
  const privateBytes = fromBase64Url(args.privateKey);
  if (privateBytes.length !== 32) throw new Error("Invalid VAPID private key");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateBytes);
  const derivedPublic = ecdh.getPublicKey();
  const configuredPublic = fromBase64Url(args.publicKey);
  if (!derivedPublic.equals(configuredPublic)) {
    throw new Error("VAPID public and private keys do not match");
  }
  const header = toBase64Url(
    Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const claims = toBase64Url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(args.endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: args.subject,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      x: toBase64Url(derivedPublic.subarray(1, 33)),
      y: toBase64Url(derivedPublic.subarray(33, 65)),
      d: toBase64Url(privateBytes),
    },
    format: "jwk",
  });
  const signature = sign("sha256", Buffer.from(unsigned), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${args.publicKey}`;
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url");
}

function toBase64Url(value: Buffer) {
  return value.toString("base64url");
}
