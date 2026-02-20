import { Controller, Get, Headers } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { ok } from "../../common/http-response";

@Controller("v1/plans")
export class PlansController {
  @Get()
  getPlans(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    ensureAuthorization(authorization, requestIdHeader);

    return ok(
      [
        {
          planId: "free",
          name: "Free",
          price: 0,
          monthlyQuota: 20,
          features: ["标准档", "基础排队"]
        },
        {
          planId: "pro_month",
          name: "Pro 月付",
          price: 39,
          monthlyQuota: 300,
          features: ["标准+高质量", "优先队列"]
        },
        {
          planId: "pro_year",
          name: "Pro 年付",
          price: 299,
          monthlyQuota: 3600,
          features: ["标准+高质量", "优先队列"]
        }
      ],
      requestIdHeader
    );
  }
}
