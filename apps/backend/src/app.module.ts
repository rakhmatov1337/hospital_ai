import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SurgeryTypesModule } from './surgery-types/surgery-types.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmConfig()),
    AuthModule,
    SurgeryTypesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
