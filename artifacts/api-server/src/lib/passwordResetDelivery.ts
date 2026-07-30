import { logger } from "./logger";

export type PasswordResetChannel = "email" | "phone";

export interface PasswordResetDelivery {
  channel: PasswordResetChannel;
  destination: string;
  code: string;
  expiresAt: Date;
  resetId: string;
}

function destinationHint(channel: PasswordResetChannel, destination: string) {
  if (channel === "email") {
    const [localPart = "", domain = ""] = destination.split("@");
    return `${localPart.slice(0, 2)}***@${domain}`;
  }

  return `*******${destination.slice(-4)}`;
}

function webhookUrl(channel: PasswordResetChannel) {
  return channel === "email"
    ? process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL
    : process.env.PASSWORD_RESET_SMS_WEBHOOK_URL;
}

/**
 * Sends a reset code through an operator-owned delivery webhook.
 *
 * The API never logs the code or the complete destination. If no webhook is
 * configured, the request is still accepted to keep account discovery
 * impossible; operators get a metadata-only warning.
 */
export async function deliverPasswordResetCode(
  delivery: PasswordResetDelivery,
): Promise<void> {
  const url = webhookUrl(delivery.channel);
  const logContext = {
    channel: delivery.channel,
    destinationHint: destinationHint(delivery.channel, delivery.destination),
    resetId: delivery.resetId,
  };

  if (!url) {
    logger.warn(
      logContext,
      "Password reset delivery webhook is not configured; code was not sent",
    );
    return;
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const webhookToken = process.env.PASSWORD_RESET_WEBHOOK_TOKEN;
  if (webhookToken) {
    headers.authorization = `Bearer ${webhookToken}`;
  }

  const timeoutMs = 10_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        purpose: "password_reset",
        channel: delivery.channel,
        to: delivery.destination,
        code: delivery.code,
        expiresAt: delivery.expiresAt.toISOString(),
        resetId: delivery.resetId,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Delivery webhook returned HTTP ${response.status}`);
    }

    logger.info(logContext, "Password reset code handed to delivery webhook");
  } finally {
    clearTimeout(timeout);
  }
}
