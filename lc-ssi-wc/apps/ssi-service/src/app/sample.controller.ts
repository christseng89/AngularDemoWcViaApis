import { Controller, Get, Post, Query } from '@nestjs/common';
import { SampleImportService } from './sample-import.service';

@Controller('messages/samples')
export class SampleController {
  constructor(private readonly samples: SampleImportService) {}
  @Get() list(): unknown { return this.samples.list(); }
  @Get('load') load(@Query('path') path: string): unknown { return this.samples.load(path); }
  @Post('import-directory') importDirectory(): unknown { return this.samples.importDirectory(); }
}
