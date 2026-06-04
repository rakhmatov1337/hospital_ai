import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { Hospital } from '../entities/hospital.entity';
import { SurgeryType } from '../entities/surgery-type.entity';
import { KbDocument } from '../entities/kb-document.entity';
import { AiInteraction } from '../entities/ai-interaction.entity';
import { SuperadminService } from './superadmin.service';
import { SuperadminController } from './superadmin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Hospital,
      SurgeryType,
      KbDocument,
      AiInteraction,
    ]),
  ],
  controllers: [SuperadminController],
  providers: [SuperadminService],
})
export class SuperadminModule {}
