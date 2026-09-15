import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import {
  FinFieldResolutionService,
  type FinFieldResolutionRequest,
} from "./fin-field-resolution.service";
import { FinControlledFixtureService } from "./fin-controlled-fixture.service";
import {
  FinControlledResolutionService,
  type FinControlledResolutionRequest,
} from "./fin-controlled-resolution.service";
import { ResolutionPageAggregationService } from "./page-parameters/resolution-page-aggregation.service";

@Controller("reference")
export class FinFieldResolutionController {
  constructor(
    private readonly service: FinFieldResolutionService,
    private readonly fixtures: FinControlledFixtureService,
    private readonly controlledResolution: FinControlledResolutionService,
    private readonly pages: ResolutionPageAggregationService,
  ) {}

  @Get("fin-resolution-catalogue")
  catalogue(@Query("standardsRelease") standardsRelease = "SR2026"): unknown {
    const catalogue = this.service.catalogueIndex(standardsRelease) as {
      readonly items: readonly { readonly messageType: string }[];
    } & Record<string, unknown>;
    const pageIndex = this.pages.index(standardsRelease);
    return {
      ...catalogue,
      pageDefinitionSchemaVersion: pageIndex.schemaVersion,
      pageDefinitionIndexVersion: pageIndex.indexVersion,
      items: catalogue.items.map((item) => ({
        ...item,
        pageDefinitions: pageIndex.items.filter(
          ({ query }) => query.messageType === item.messageType,
        ),
      })),
    };
  }

  @Get("fin-controlled-fixtures")
  controlledFixtures(
    @Query("messageType") messageType = "",
    @Query("sequence") sequence = "",
    @Query("currency") currency = "",
    @Query("bookingEntity") bookingEntity = "",
    @Query("valueDate") valueDate = "",
    @Query("bindingId") bindingId = "",
  ): unknown {
    return this.fixtures.list({
      messageType,
      ...(sequence ? { sequence } : {}),
      currency,
      bookingEntity,
      valueDate,
      ...(bindingId ? { bindingId } : {}),
    });
  }

  @Post("fin-controlled-resolutions")
  @HttpCode(200)
  resolveControlled(@Body() body: FinControlledResolutionRequest): unknown {
    return this.controlledResolution.resolve(body);
  }

  @Post("fin-tag-resolutions")
  @HttpCode(200)
  resolve(@Body() body: FinFieldResolutionRequest): unknown {
    return this.service.resolve(body);
  }
}
