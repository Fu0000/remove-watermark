import { Controller, Get } from "@nestjs/common";

@Controller("v1/plans")
export class PlansController {
  @Get()
  getPlans() {
    return {
      code: 0,
      message: "ok",
      requestId: crypto.randomUUID(),
      data: [
        { planId: "free", name: "Free", price: 0, monthlyQuota: 20 },
        { planId: "pro_month", name: "Pro 月付", price: 39, monthlyQuota: 300 }
      ]
    };
  }
}
