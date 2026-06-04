import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CheckInDto } from './risk.dto';
import { assessRisk, RiskAgent } from './risk.service';
import { riskAgent } from '../mastra/agents/risk.agent';

@ApiTags('ai')
@Controller('ai')
export class RiskController {
  @Post('risk-score')
  @ApiOperation({
    summary: 'Score a recovery check-in with confidence + auto-alert (AI-04)',
  })
  async score(@Body() body: CheckInDto) {
    return assessRisk(riskAgent as unknown as RiskAgent, body);
  }
}
