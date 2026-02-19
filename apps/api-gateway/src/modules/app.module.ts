import { Module } from "@nestjs/common";
import { SystemController } from "./system/system.controller";
import { AssetsController } from "./assets/assets.controller";
import { TasksController } from "./tasks/tasks.controller";
import { PlansController } from "./plans/plans.controller";

@Module({
  controllers: [SystemController, AssetsController, TasksController, PlansController]
})
export class AppModule {}
