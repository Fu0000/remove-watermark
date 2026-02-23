import { Body, Controller, Get, Headers, HttpCode, Inject, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest, notFound, unauthorized } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { parseRequestBody } from "../../common/request-validation";
import {
  safeCompareSignature,
  signPaymentCallback,
  type PaymentCallbackSignatureInput
} from "./payment-callback-signature";
import { SubscriptionsService } from "./subscriptions.service";
import { z } from "zod";

interface CheckoutRequest {
  planId: string;
  channel: "wechat_pay";
  clientReturnUrl: string;
}

interface ConfirmRequest {
  orderId: string;
}

interface PaymentCallbackRequest {
  eventId: string;
  orderId: string;
  paymentStatus: "PAID" | "REFUNDED";
  providerTradeNo?: string;
  paidAt?: string;
  refundedAt?: string;
  refundReason?: string;
}

const CheckoutRequestSchema = z.object({
  planId: z.string().min(1),
  channel: z.literal("wechat_pay"),
  clientReturnUrl: z.string().url()
});

const ConfirmRequestSchema = z.object({
  orderId: z.string().min(1)
});

const PaymentCallbackRequestSchema = z
  .object({
    eventId: z.string().min(1),
    orderId: z.string().min(1),
    paymentStatus: z.enum(["PAID", "REFUNDED"]),
    providerTradeNo: z.string().optional(),
    paidAt: z.string().optional(),
    refundedAt: z.string().optional(),
    refundReason: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (value.paidAt !== undefined && Number.isNaN(new Date(value.paidAt).getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "paidAt"
      });
    }
    if (value.refundedAt !== undefined && Number.isNaN(new Date(value.refundedAt).getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "refundedAt"
      });
    }
  });

@Controller("v1/subscriptions")
export class SubscriptionsController {
  private readonly paymentCallbackSecret = process.env.PAYMENT_CALLBACK_SECRET || "payment-local-secret";
  private readonly paymentCallbackReplayWindowSeconds = parsePositiveInt(
    process.env.PAYMENT_CALLBACK_REPLAY_WINDOW_SECONDS,
    300
  );

  constructor(@Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService) {}

  @Post("checkout")
  @HttpCode(200)
  async checkout(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Body() rawBody: CheckoutRequest
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const body = parseRequestBody(CheckoutRequestSchema, rawBody, requestIdHeader);

    const result = await this.subscriptionsService.checkout(auth.userId, body);
    if (!result) {
      badRequest(40001, "参数非法：planId 不存在", requestIdHeader);
    }

    return ok(result, requestIdHeader);
  }

  @Get("me")
  async getMine(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const result = await this.subscriptionsService.getMySubscription(auth.userId);
    return ok(result, requestIdHeader);
  }

  @Post("mock-confirm")
  @HttpCode(200)
  async mockConfirm(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Body() rawBody: ConfirmRequest
  ) {
    const auth = ensureAuthorization(authorization, requestIdHeader);
    const body = parseRequestBody(ConfirmRequestSchema, rawBody, requestIdHeader);

    const result = await this.subscriptionsService.confirmCheckout(auth.userId, body.orderId);
    if (!result) {
      badRequest(40001, "参数非法：orderId 不存在", requestIdHeader);
    }

    return ok(result, requestIdHeader);
  }

  @Post("payment-callback")
  @HttpCode(200)
  async paymentCallback(
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Headers("x-payment-timestamp") paymentTimestampHeader: string | undefined,
    @Headers("x-payment-signature") paymentSignatureHeader: string | undefined,
    @Body() rawBody: PaymentCallbackRequest
  ) {
    const body = parseRequestBody(PaymentCallbackRequestSchema, rawBody, requestIdHeader);

    if (!paymentTimestampHeader || !paymentSignatureHeader) {
      unauthorized(40101, "鉴权失败：缺少支付回调签名", requestIdHeader);
    }

    const timestampSeconds = Number(paymentTimestampHeader);
    if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
      badRequest(40001, "参数非法：x-payment-timestamp", requestIdHeader);
    }

    const replayWindowMs = this.paymentCallbackReplayWindowSeconds * 1000;
    const callbackMs = Math.floor(timestampSeconds * 1000);
    if (Math.abs(Date.now() - callbackMs) > replayWindowMs) {
      unauthorized(40101, "鉴权失败：支付回调超出时间窗口", requestIdHeader);
    }

    const signatureInput: PaymentCallbackSignatureInput = {
      timestamp: paymentTimestampHeader,
      eventId: body.eventId,
      orderId: body.orderId,
      paymentStatus: body.paymentStatus
    };
    const expectedSignature = signPaymentCallback(this.paymentCallbackSecret, signatureInput);
    if (!safeCompareSignature(paymentSignatureHeader, expectedSignature)) {
      unauthorized(40101, "鉴权失败：支付回调签名不匹配", requestIdHeader);
    }

    const result = await this.subscriptionsService.processPaymentCallback({
      eventId: body.eventId,
      orderId: body.orderId,
      paymentStatus: body.paymentStatus,
      providerTradeNo: body.providerTradeNo,
      paidAt: body.paidAt ? parseIsoDatetime(body.paidAt, "paidAt", requestIdHeader) : undefined,
      refundedAt: body.refundedAt ? parseIsoDatetime(body.refundedAt, "refundedAt", requestIdHeader) : undefined,
      refundReason: body.refundReason
    });

    if (!result) {
      notFound(40401, "资源不存在：orderId", requestIdHeader);
    }

    return ok(result, requestIdHeader);
  }
}

function parseIsoDatetime(value: string, fieldName: string, requestIdHeader: string | undefined) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    badRequest(40001, `参数非法：${fieldName}`, requestIdHeader);
  }
  return date;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
