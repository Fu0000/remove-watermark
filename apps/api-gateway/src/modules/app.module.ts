import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { SystemController } from "./system/system.controller";
import { AssetsController } from "./assets/assets.controller";
import { TasksController } from "./tasks/tasks.controller";
import { PlansController } from "./plans/plans.controller";
import { TasksService } from "./tasks/tasks.service";
import { PrismaService } from "./common/prisma.service";
import { PlansService } from "./plans/plans.service";
import { SubscriptionsController } from "./subscriptions/subscriptions.controller";
import { UsageController } from "./usage/usage.controller";
import { SubscriptionsService } from "./subscriptions/subscriptions.service";
import { WebhooksController } from "./webhooks/webhooks.controller";
import { WebhooksService } from "./webhooks/webhooks.service";
import { AccountController } from "./compliance/account.controller";
import { ComplianceService } from "./compliance/compliance.service";
import { AdminController } from "./admin/admin.controller";

@Module({
  controllers: [
    AuthController,
    SystemController,
    AssetsController,
    TasksController,
    PlansController,
    SubscriptionsController,
    UsageController,
    WebhooksController,
    AccountController,
    AdminController
  ],
  providers: [
    PrismaService,
    PlansService,
    SubscriptionsService,
    WebhooksService,
    ComplianceService,
    {
      provide: TasksService,
      useFactory: (prismaService: PrismaService) => new TasksService({}, prismaService),
      inject: [PrismaService]
    }
  ]
})
export class AppModule {}
