import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { SystemController } from "./system/system.controller";
import { AssetsController } from "./assets/assets.controller";
import { TasksController } from "./tasks/tasks.controller";
import { PlansController } from "./plans/plans.controller";
import { TasksService } from "./tasks/tasks.service";
import { PrismaService } from "./common/prisma.service";
import { PlansService } from "./plans/plans.service";

@Module({
  controllers: [AuthController, SystemController, AssetsController, TasksController, PlansController],
  providers: [
    PrismaService,
    PlansService,
    {
      provide: TasksService,
      useFactory: (prismaService: PrismaService) => new TasksService({}, prismaService),
      inject: [PrismaService]
    }
  ]
})
export class AppModule {}
