import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductEntity, SessionEntity, StudentEntity, TodoEntity, UserEntity } from "./demo.entities.js";
import { ReqController } from "./req.controller.js";
import { NlRequestService } from "./nl-request.service.js";
import { ensureSqliteDirectory, getSqlitePath } from "./sqlite.config.js";
import { SqliteDemoService } from "./sqlite-demo.service.js";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const dbPath = getSqlitePath();
        ensureSqliteDirectory(dbPath);

        return {
          type: "better-sqlite3",
          database: dbPath,
          entities: [UserEntity, StudentEntity, SessionEntity, TodoEntity, ProductEntity],
          synchronize: true
        };
      }
    }),
    TypeOrmModule.forFeature([UserEntity, StudentEntity, SessionEntity, TodoEntity, ProductEntity])
  ],
  controllers: [ReqController],
  providers: [SqliteDemoService, NlRequestService]
})
export class AppModule {}
