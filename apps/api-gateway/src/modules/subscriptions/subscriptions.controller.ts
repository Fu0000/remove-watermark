import { Body, Controller, Get, Headers, HttpCode, Inject, Post } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { badRequest } from "../../common/http-errors";
import { ok } from "../../common/http-response";
import { SubscriptionsService } from "./subscriptions.service";

interface CheckoutRequest {
  planId: string;
  channel: "wechat_pay";
  clientReturnUrl: string;
}

@Controller("v1/subscriptions")
export class SubscriptionsController {
  constructor(@Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService) {}

  @Post("checkout")
  @HttpCode(200)
  async checkout(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined,
    @Body() body: CheckoutRequest
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    if (!body.planId || !body.channel || !body.clientReturnUrl) {
      badRequest(40001, "参数非法", requestIdHeader);
    }

    if (body.channel !== "wechat_pay") {
      badRequest(40001, "参数非法：channel 仅支持 wechat_pay", requestIdHeader);
    }

    try {
      new URL(body.clientReturnUrl);
    } catch {
      badRequest(40001, "参数非法：clientReturnUrl", requestIdHeader);
    }

    const result = await this.subscriptionsService.checkout("u_1001", body);
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
    ensureAuthorization(authorization, requestIdHeader);
    const result = await this.subscriptionsService.getMySubscription("u_1001");
    return ok(result, requestIdHeader);
  }
}
