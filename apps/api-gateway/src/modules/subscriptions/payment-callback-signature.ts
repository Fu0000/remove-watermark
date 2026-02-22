import { createHmac, timingSafeEqual } from "node:crypto";

export const PAYMENT_CALLBACK_SIGNATURE_VERSION = "v1";

export interface PaymentCallbackSignatureInput {
  timestamp: string;
  eventId: string;
  orderId: string;
  paymentStatus: "PAID" | "REFUNDED";
}

export function buildPaymentCallbackSigningPayload(input: PaymentCallbackSignatureInput) {
  return `${input.timestamp}.${input.eventId}.${input.orderId}.${input.paymentStatus}`;
}

export function signPaymentCallback(secret: string, input: PaymentCallbackSignatureInput) {
  const payload = buildPaymentCallbackSigningPayload(input);
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  return `${PAYMENT_CALLBACK_SIGNATURE_VERSION}=${digest}`;
}

export function safeCompareSignature(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
