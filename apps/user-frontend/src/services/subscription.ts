import { request } from "./http";

export interface PlanView {
  planId: string;
  name: string;
  price: number;
  monthlyQuota: number;
  features: string[];
  sortOrder: number;
}

export interface SubscriptionView {
  status: "PENDING" | "ACTIVE" | "PAST_DUE" | "CANCELED" | "EXPIRED" | "REFUNDED";
  planId: string;
  effectiveAt: string | null;
  expireAt: string | null;
  autoRenew: boolean;
}

export interface UsageLedgerItem {
  ledgerId: string;
  userId: string;
  taskId: string;
  consumeUnit: number;
  status: "HELD" | "COMMITTED" | "RELEASED";
  source: string;
  consumeAt: string;
}

export interface UsageView {
  quotaTotal: number;
  quotaLeft: number;
  periodStart: string;
  periodEnd: string;
  ledgerItems: UsageLedgerItem[];
}

export interface CheckoutPayload {
  planId: string;
  channel: "wechat_pay";
  clientReturnUrl: string;
}

export interface CheckoutResult {
  orderId: string;
  paymentPayload: {
    nonceStr: string;
    timeStamp: string;
    sign: string;
  };
}

export function listPlans() {
  return request<PlanView[]>("/v1/plans", {
    method: "GET"
  });
}

export function checkoutSubscription(payload: CheckoutPayload, idempotencyKey: string) {
  return request<CheckoutResult>("/v1/subscriptions/checkout", {
    method: "POST",
    idempotencyKey,
    data: payload
  });
}

export function mockConfirmSubscription(orderId: string, idempotencyKey: string) {
  return request<SubscriptionView>("/v1/subscriptions/mock-confirm", {
    method: "POST",
    idempotencyKey,
    data: {
      orderId
    }
  });
}

export function getMySubscription() {
  return request<SubscriptionView>("/v1/subscriptions/me", {
    method: "GET"
  });
}

export function getMyUsage() {
  return request<UsageView>("/v1/usage/me", {
    method: "GET"
  });
}
