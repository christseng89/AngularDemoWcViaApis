import { HttpClient, HttpParams } from "@angular/common/http";
import { InjectionToken, inject, Injectable } from "@angular/core";
import type {
  PageParameterExecution,
  PageParameterBusinessDomain,
  PageParameterLookupEnvelope,
  PageParameterLookupMetadata,
  PageParameterLookupResult,
  ResolutionPageDefinitionEnvelope,
  ResolutionPageDefinitionIndexEnvelope,
  ResolutionPageDefinitionQuery,
  ResolutionPageExecutionResult,
  ResolutionPageSubmission,
} from "@ssi/contracts";
import { map, type Observable } from "rxjs";

export interface ResolutionPageParameterClient {
  loadIndex(
    businessDomain: PageParameterBusinessDomain,
  ): Observable<ResolutionPageDefinitionIndexEnvelope>;
  load(
    query: ResolutionPageDefinitionQuery,
  ): Observable<ResolutionPageDefinitionEnvelope>;
  execute(
    execution: PageParameterExecution,
    request: ResolutionPageSubmission,
  ): Observable<ResolutionPageExecutionResult>;
  lookup(
    metadata: PageParameterLookupMetadata,
    request: PageParameterLookupRequest,
  ): Observable<PageParameterLookupEnvelope>;
}

export interface PageParameterLookupRequest {
  readonly query?: string;
  readonly bankServiceId?: string;
  readonly scenarioId?: string;
  readonly messageType?: string;
  readonly sequence?: string;
  readonly dependencyValues?: Readonly<Record<string, string | boolean>>;
}

const assertSameOriginApiEndpoint = (endpoint: string): void => {
  if (!/^\/api\/(?!\/)[A-Za-z0-9/_?=&.%:-]+$/.test(endpoint))
    throw new Error("PAGE_PARAMETER_ENDPOINT_NOT_SAME_ORIGIN");
};

const queryParameters = (query: ResolutionPageDefinitionQuery): HttpParams => {
  let parameters = new HttpParams()
    .set("standardsRelease", query.standardsRelease)
    .set("messageFamily", query.messageFamily)
    .set("messageType", query.messageType)
    .set("direction", query.direction);
  if (query.businessScenarioId)
    parameters = parameters.set("businessScenarioId", query.businessScenarioId);
  if (query.businessService)
    parameters = parameters.set("businessService", query.businessService);
  if (query.businessDomain)
    parameters = parameters.set("businessDomain", query.businessDomain);
  return parameters;
};

const setWhenPresent = (
  params: HttpParams,
  name: string,
  value: string | boolean | undefined,
): HttpParams =>
  value === undefined || value === ""
    ? params
    : params.set(name, String(value));

const governedLookupParameters = (
  metadata: PageParameterLookupMetadata,
  request: PageParameterLookupRequest,
  initial: HttpParams,
): HttpParams => {
  let params = setWhenPresent(initial, "scenarioId", request.scenarioId);
  params = setWhenPresent(params, "messageType", request.messageType);
  params = setWhenPresent(params, "sequence", request.sequence);
  params = setWhenPresent(params, "targetRole", metadata.targetRole);
  for (const fieldId of metadata.dependency?.dependsOnFieldIds ?? []) {
    const name = fieldId.split(".").at(-1) ?? fieldId;
    params = setWhenPresent(params, name, request.dependencyValues?.[fieldId]);
  }
  return params;
};

const lookupEnvelope = (
  response: PageParameterLookupEnvelope | PageParameterLookupResult,
): PageParameterLookupEnvelope => {
  if ("items" in response) {
    if (
      response.provider === "SSI_COUNTERPARTY" &&
      (response.eligibilitySnapshot ||
        response.items.some((item) => item.selectedRouteIdentity))
    ) {
      if (!response.eligibilitySnapshot)
        throw new Error("PAGE_PARAMETER_ELIGIBILITY_SNAPSHOT_REQUIRED");
      if (
        response.items.some(
          (item) =>
            !item.selectedRouteIdentity ||
            item.selectedRouteIdentity?.contextSha256 !==
              response.eligibilitySnapshot!.contextSha256,
        )
      )
        throw new Error("PAGE_PARAMETER_ROUTE_BINDING_INVALID");
    }
    return response;
  }
  return {
    provider: response.provider,
    action: response.action,
    items: [response],
  };
};

@Injectable()
export class HttpResolutionPageParameterClient implements ResolutionPageParameterClient {
  private readonly http = inject(HttpClient);

  loadIndex(
    businessDomain: PageParameterBusinessDomain,
  ): Observable<ResolutionPageDefinitionIndexEnvelope> {
    return this.http.get<ResolutionPageDefinitionIndexEnvelope>(
      "/api/v1/resolution-page-definitions/index",
      { params: new HttpParams().set("businessDomain", businessDomain) },
    );
  }

  load(
    query: ResolutionPageDefinitionQuery,
  ): Observable<ResolutionPageDefinitionEnvelope> {
    return this.http.get<ResolutionPageDefinitionEnvelope>(
      "/api/v1/resolution-page-definitions",
      { params: queryParameters(query) },
    );
  }

  execute(
    execution: PageParameterExecution,
    request: ResolutionPageSubmission,
  ): Observable<ResolutionPageExecutionResult> {
    const { endpoint, method } = execution;
    assertSameOriginApiEndpoint(endpoint);
    if (method !== "POST")
      throw new Error("PAGE_PARAMETER_HTTP_METHOD_NOT_SUPPORTED");
    return this.http.post<ResolutionPageExecutionResult>(endpoint, request);
  }

  lookup(
    metadata: PageParameterLookupMetadata,
    request: PageParameterLookupRequest,
  ): Observable<PageParameterLookupEnvelope> {
    assertSameOriginApiEndpoint(metadata.endpoint);
    let params = new HttpParams();
    params = setWhenPresent(params, "query", request.query);
    params = setWhenPresent(params, "bankServiceId", request.bankServiceId);
    params = governedLookupParameters(metadata, request, params);
    return this.http
      .get<PageParameterLookupEnvelope | PageParameterLookupResult>(
        metadata.endpoint,
        { params },
      )
      .pipe(map(lookupEnvelope));
  }
}

export const RESOLUTION_PAGE_PARAMETER_CLIENT =
  new InjectionToken<ResolutionPageParameterClient>(
    "RESOLUTION_PAGE_PARAMETER_CLIENT",
  );

export const provideResolutionPageParameterClient = () => ({
  provide: RESOLUTION_PAGE_PARAMETER_CLIENT,
  useClass: HttpResolutionPageParameterClient,
});
