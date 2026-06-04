import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatRequestDto } from './chat.dto';
import { nurseChat, ChatAgent } from './chat.service';
import { nurseChatAgent } from '../mastra/agents/nurse-chat.agent';

@ApiTags('ai')
@Controller('ai')
export class ChatController {
  @Post('chat')
  @ApiOperation({ summary: 'Chat with the AI Recovery Nurse (AI-03)' })
  async chat(@Body() body: ChatRequestDto): Promise<{ reply: string }> {
    const { reply } = await nurseChat(
      nurseChatAgent as unknown as ChatAgent,
      body.messages,
      {
        patientId: body.patientId,
        threadId: body.threadId,
        surgeryType: body.surgeryType,
        recoveryDay: body.recoveryDay,
      },
    );
    return { reply };
  }
}
