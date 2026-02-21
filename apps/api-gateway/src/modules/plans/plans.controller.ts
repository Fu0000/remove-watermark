import { Controller, Get, Headers, Inject } from "@nestjs/common";
import { ensureAuthorization } from "../../common/auth";
import { ok } from "../../common/http-response";
import { PlansService } from "./plans.service";

@Controller("v1/plans")
export class PlansController {
  constructor(@Inject(PlansService) private readonly plansService: PlansService) {}

  @Get()
  async getPlans(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-request-id") requestIdHeader: string | undefined
  ) {
    ensureAuthorization(authorization, requestIdHeader);
    const plans = await this.plansService.listPlans();

    return ok(plans, requestIdHeader);
  }
}
