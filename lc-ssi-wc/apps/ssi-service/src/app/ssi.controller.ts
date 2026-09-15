import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { SsiApplicationService, type CreateSsiCommand } from './ssi-application.service';

@Controller('ssis')
export class SsiController {
  constructor(private readonly service: SsiApplicationService) {}
  @Get() list(): unknown { return this.service.list(); }
  @Get('applicability') applicability(@Query('ssiId') ssiId?:string): unknown { return this.service.listApplicability(ssiId); }
  @Post() create(@Body() body: CreateSsiCommand): unknown { return this.service.create(body); }
  @Put(':id') update(@Param('id') id: string, @Body() body: CreateSsiCommand): unknown { return this.service.update(id, body); }
  @Put(':id/applicability') replaceApplicability(@Param('id') id:string,@Body() body:Parameters<SsiApplicationService['replaceApplicability']>[1]):unknown{return this.service.replaceApplicability(id,body);}
  @Post(':id/revise') revise(@Param('id') id: string, @Body() body: { maker: string }): unknown { return this.service.revise(id, body.maker); }
  @Delete(':id') revoke(@Param('id') id: string, @Body() body: { actor: string; reason: string }): unknown { return this.service.revoke(id, body.actor, body.reason); }
  @Post('resolve/confirm') confirm(@Body() body: Parameters<SsiApplicationService['confirm']>[0]): unknown { return this.service.confirm(body); }
  @Post('resolve/clearing-options') clearingOptions(@Body() body: Parameters<SsiApplicationService['clearingOptions']>[0]): unknown { return this.service.clearingOptions(body); }
  @Post('resolve') resolve(@Body() body: Parameters<SsiApplicationService['resolve']>[0]): unknown { return this.service.resolve(body); }
  @Post(':id/submit') submit(@Param('id') id: string, @Body() body: { actor: string }): unknown { return this.service.transition(id, 'SUBMIT', body.actor); }
  @Post(':id/approve') approve(@Param('id') id: string, @Body() body: { actor: string }): unknown { return this.service.transition(id, 'APPROVE', body.actor); }
  @Post(':id/activate') activate(@Param('id') id: string, @Body() body: { actor: string }): unknown { return this.service.transition(id, 'ACTIVATE', body.actor); }
  @Get('audit/events') audit(): unknown { return this.service.audit(); }
}
