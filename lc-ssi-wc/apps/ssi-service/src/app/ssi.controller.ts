import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  SsiApplicationService,
  type CreateSsiCommand,
} from "./ssi-application.service";

interface SsiListQuery {
  status?: string;
  ownershipType?: "OWN" | "COUNTERPARTY";
  counterpartyId?: string;
  page?: string;
  pageSize?: string;
  search?: string;
  sortBy?: string;
  sortDirection?: "ASC" | "DESC";
}

@Controller("ssis")
export class SsiController {
  constructor(private readonly service: SsiApplicationService) {}
  @Get() list(@Query() query: SsiListQuery = {}): unknown {
    const {
      status,
      ownershipType,
      counterpartyId,
      page,
      pageSize,
      search,
      sortBy,
      sortDirection,
    } = query;
    if (
      page === undefined &&
      pageSize === undefined &&
      search === undefined &&
      ownershipType === undefined &&
      sortBy === undefined
    )
      return this.service.list(status);
    const parsedPage = Number(page ?? "1");
    const parsedPageSize = Number(pageSize ?? "20");
    if (
      !Number.isInteger(parsedPage) ||
      parsedPage < 1 ||
      !Number.isInteger(parsedPageSize) ||
      parsedPageSize < 1
    )
      throw new BadRequestException("INVALID_PAGINATION");
    return this.service.listPage({
      page: parsedPage,
      pageSize: Math.min(100, parsedPageSize),
      ...(status !== undefined ? { status } : {}),
      ...(ownershipType !== undefined ? { ownershipType } : {}),
      ...(counterpartyId !== undefined ? { counterpartyId } : {}),
      ...(search !== undefined ? { search } : {}),
      ...(sortBy !== undefined ? { sortBy } : {}),
      ...(sortDirection !== undefined ? { sortDirection } : {}),
    });
  }
  @Get("summary") summary(): unknown {
    return this.service.summary();
  }
  @Get("counterparty-coverage") counterpartyCoverage(
    @Query("status") status?: string,
  ): unknown {
    return this.service.counterpartyCoverage(status);
  }
  @Get("applicability") applicability(@Query("ssiId") ssiId?: string): unknown {
    return this.service.listApplicability(ssiId);
  }
  @Post() create(@Body() body: CreateSsiCommand): unknown {
    return this.service.create(body);
  }
  @Put(":id") update(
    @Param("id") id: string,
    @Body() body: CreateSsiCommand,
  ): unknown {
    return this.service.update(id, body);
  }
  @Put(":id/applicability") replaceApplicability(
    @Param("id") id: string,
    @Body() body: Parameters<SsiApplicationService["replaceApplicability"]>[1],
  ): unknown {
    return this.service.replaceApplicability(id, body);
  }
  @Post(":id/revise") revise(
    @Param("id") id: string,
    @Body() body: { maker: string },
  ): unknown {
    return this.service.revise(id, body.maker);
  }
  @Post(":id/cancel-revision") cancelRevision(
    @Param("id") id: string,
    @Body() body: { actor: string },
  ): unknown {
    return this.service.cancelRevision(id, body.actor);
  }
  @Post(":id/suppress") suppress(
    @Param("id") id: string,
    @Body() body: { maker: string; reason: string },
  ): unknown {
    return this.service.suppress(id, body.maker, body.reason);
  }
  @Delete(":id") revoke(
    @Param("id") id: string,
    @Body() body: { actor: string; reason: string },
  ): unknown {
    return this.service.revoke(id, body.actor, body.reason);
  }
  @Post("resolve/confirm") confirm(
    @Body() body: Parameters<SsiApplicationService["confirm"]>[0],
  ): unknown {
    return this.service.confirm(body);
  }
  @Post("resolve/clearing-options") clearingOptions(
    @Body() body: Parameters<SsiApplicationService["clearingOptions"]>[0],
  ): unknown {
    return this.service.clearingOptions(body);
  }
  @Post("resolve") resolve(
    @Body() body: Parameters<SsiApplicationService["resolve"]>[0],
  ): unknown {
    return this.service.resolve(body);
  }
  @Post(":id/submit") submit(
    @Param("id") id: string,
    @Body() body: { actor: string },
  ): unknown {
    return this.service.transition(id, "SUBMIT", body.actor);
  }
  @Post(":id/approve") approve(
    @Param("id") id: string,
    @Body() body: { actor: string },
  ): unknown {
    return this.service.transition(id, "APPROVE", body.actor);
  }
  @Post(":id/reject") reject(
    @Param("id") id: string,
    @Body() body: { actor: string; reason: string },
  ): unknown {
    return this.service.transition(id, "REJECT", body.actor, body.reason);
  }
  @Post(":id/activate") activate(
    @Param("id") id: string,
    @Body() body: { actor: string },
  ): unknown {
    return this.service.transition(id, "ACTIVATE", body.actor);
  }
  @Get("audit/events") audit(): unknown {
    return this.service.audit();
  }
}
