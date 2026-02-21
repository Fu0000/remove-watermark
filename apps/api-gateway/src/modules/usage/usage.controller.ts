import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { ok } from "../../common/http-response";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";

@Controller("v1/usage")
export class UsageController {
  constructor(@Inject(SubscriptionsService) private readonly subscriptionsService: SubscriptionsService) {}

  @Get("me")
  async getMine(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    const usage = await this.subscriptionsService.getMyUsage("u_1001");
    return ok(usage, requestIdHeader);
  }
}
