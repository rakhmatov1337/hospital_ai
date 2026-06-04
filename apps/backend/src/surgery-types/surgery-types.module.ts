import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SurgeryType } from '../entities/surgery-type.entity';

@ApiTags('surgery-types')
@Controller('surgery-types')
class SurgeryTypesController {
  constructor(
    @InjectRepository(SurgeryType)
    private readonly repo: Repository<SurgeryType>,
  ) {}

  @Get()
  findAll() {
    return this.repo.find();
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([SurgeryType])],
  controllers: [SurgeryTypesController],
})
export class SurgeryTypesModule {}
