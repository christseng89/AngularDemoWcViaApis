import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  ForbiddenException,
  BadRequestException,
  Optional,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DevelopmentDataReloadService } from "./development-data-reload.service";
import { ResolutionCurrencyCoverageCoordinator } from "./resolution-currency-coordinator";
import {
  RESOLUTION_CURRENCY_SORT_COLUMNS,
  ResolutionCurrencyInquiryPolicy,
  type ResolutionCurrencySortColumn,
  type ResolutionCurrencySortDirection,
} from "./resolution-currency-inquiry.policy";

@Controller("settings")
export class RuntimeSettingsController {
  constructor(
    private readonly reloadService: DevelopmentDataReloadService,
    @Optional()
    private readonly currencies?: ResolutionCurrencyCoverageCoordinator,
    @Optional()
    private readonly inquiryPolicy: ResolutionCurrencyInquiryPolicy = new ResolutionCurrencyInquiryPolicy(),
  ) {}

  @Get("runtime")
  runtime(): unknown {
    return {
      ...this.reloadService.status(),
      resolutionCurrencyInquiry: this.inquiryPolicy.contract,
    };
  }

  @Post("development-data/reload")
  async reload(
    @Body() body: { authorizationToken?: unknown; datasetId?: unknown },
  ): Promise<unknown> {
    const result = await this.reloadService.reload(
      typeof body?.authorizationToken === "string"
        ? body.authorizationToken
        : "",
      typeof body?.datasetId === "string" ? body.datasetId : undefined,
    );
    this.currencies?.onReloadCommitted();
    return result;
  }

  @Post("development-data/export")
  exportCurrentDatabase(): unknown {
    return this.reloadService.exportCurrentDatabase();
  }

  @Post("development-data/reload/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { files: 1, fileSize: 80 * 1024 * 1024 },
    }),
  )
  uploadReloadDataset(
    @Body() body: { authorizationToken?: unknown },
    @UploadedFile()
    file?: { readonly originalname: string; readonly buffer: Buffer },
  ): unknown {
    if (!file) throw new BadRequestException("DEMO_RELOAD_FILE_REQUIRED");
    return this.reloadService.uploadDataset(
      typeof body?.authorizationToken === "string"
        ? body.authorizationToken
        : "",
      { originalName: file.originalname, buffer: file.buffer },
    );
  }

  @Post("development-data/reload/authorize")
  authorizeReload(@Body() body: { password?: unknown }): unknown {
    return this.reloadService.authorize(
      typeof body?.password === "string" ? body.password : "",
    );
  }

  @Post("development-data/reload/cancel")
  cancelReloadAuthorization(
    @Body() body: { authorizationToken?: unknown },
  ): unknown {
    return this.reloadService.cancelAuthorization(
      typeof body?.authorizationToken === "string"
        ? body.authorizationToken
        : "",
    );
  }

  @Get("resolution-currencies")
  resolutionCurrencyInquiry(
    @Query()
    query: {
      page?: string;
      pageSize?: string;
      businessDomain?: string;
      status?: string;
      search?: string;
      sortBy?: string;
      sortDirection?: string;
    },
  ): unknown {
    const page = Number(query.page ?? "1");
    const pageSize = Number(
      query.pageSize ?? this.inquiryPolicy.contract.pageSize,
    );
    const sortBy = query.sortBy ?? this.inquiryPolicy.contract.sortBy;
    const sortDirection =
      query.sortDirection ?? this.inquiryPolicy.contract.sortDirection;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100 ||
      !RESOLUTION_CURRENCY_SORT_COLUMNS.includes(
        sortBy as ResolutionCurrencySortColumn,
      ) ||
      !["asc", "desc"].includes(sortDirection) ||
      (query.businessDomain &&
        !["PAYMENT", "TREASURY", "TRADE_FINANCE"].includes(
          query.businessDomain,
        )) ||
      (query.status && !["ACTIVE", "INACTIVE"].includes(query.status))
    )
      throw new BadRequestException("RESOLUTION_CURRENCY_INVALID_INQUIRY");
    return this.currencies?.inquiry({
      page,
      pageSize,
      sortBy: sortBy as ResolutionCurrencySortColumn,
      sortDirection: sortDirection as ResolutionCurrencySortDirection,
      ...(query.businessDomain
        ? {
            businessDomain: query.businessDomain as
              "PAYMENT" | "TREASURY" | "TRADE_FINANCE",
          }
        : {}),
      ...(query.status
        ? { status: query.status as "ACTIVE" | "INACTIVE" }
        : {}),
      ...(query.search ? { search: query.search } : {}),
    });
  }

  @Post("resolution-currencies/resync")
  resyncResolutionCurrencies(): unknown {
    if (!this.reloadService.status().developmentEnabled)
      throw new ForbiddenException("DEVELOPMENT_MODE_REQUIRED");
    return this.currencies?.resync();
  }
}
