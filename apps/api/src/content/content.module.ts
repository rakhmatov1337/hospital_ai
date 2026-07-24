import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentManagementController } from './content-management.controller';
import { ContentService } from './content.service';
import { ContentManagementService } from './content-management.service';

/**
 * Content module. The staff content-management controller (D8) is registered
 * BEFORE the public `:key` resolver so its literal routes (e.g.
 * `GET /content/unapproved-count`) match ahead of the `GET /content/:key` wildcard.
 */
@Module({
  controllers: [ContentManagementController, ContentController],
  providers: [ContentService, ContentManagementService],
  exports: [ContentService],
})
export class ContentModule {}
