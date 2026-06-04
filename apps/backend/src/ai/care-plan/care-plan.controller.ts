import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GenerateCarePlanDto } from './care-plan.dto';
import { generateCarePlan, CarePlanAgent } from './care-plan.service';
import { carePlanAgent } from '../mastra/agents/care-plan.agent';

@ApiTags('ai')
@Controller('ai')
export class CarePlanController {
  @Post('care-plan')
  @ApiOperation({ summary: 'Generate a grounded cesarean care plan (AI-02)' })
  async generate(@Body() body: GenerateCarePlanDto) {
    return generateCarePlan(
      carePlanAgent as unknown as CarePlanAgent,
      body.surgeryType,
      new Date(body.surgeryDate),
    );
  }
}
