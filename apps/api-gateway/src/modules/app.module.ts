import { Module } from "@nestjs/common";
import { AuthController } from "./auth/auth.controller";
import { SystemController } from "./system/system.controller";
import { AssetsController } from "./assets/assets.controller";
import { TasksController } from "./tasks/tasks.controller";
import { PlansController } from "./plans/plans.controller";
import { TasksService } from "./tasks/tasks.service";

@Module({
  controllers: [AuthController, SystemController, AssetsController, TasksController, PlansController],
  providers: [TasksService]
})
export class AppModule {}
