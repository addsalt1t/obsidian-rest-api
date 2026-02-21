interface OpenApiParameter {
  name: string;
  in: string;
  required?: boolean;
  schema: Record<string, unknown>;
  description?: string;
}

const SEARCH_LIMIT_QUERY_PARAMETER: OpenApiParameter = {
  name: 'limit',
  in: 'query',
  schema: { type: 'integer', default: 100, maximum: 1000 },
  description: 'Max results',
};

const SEARCH_OFFSET_QUERY_PARAMETER: OpenApiParameter = {
  name: 'offset',
  in: 'query',
  schema: { type: 'integer', default: 0 },
  description: 'Start offset',
};

const SEARCH_BASE_PATH_QUERY_PARAMETER: OpenApiParameter = {
  name: 'basePath',
  in: 'query',
  schema: { type: 'string' },
  description: 'Restrict search to folder path',
};

const PERIOD_PATH_PARAMETER: OpenApiParameter = {
  name: 'period',
  in: 'path',
  required: true,
  schema: {
    type: 'string',
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
  },
};

const PERIOD_YEAR_QUERY_PARAMETER: OpenApiParameter = {
  name: 'year',
  in: 'query',
  schema: { type: 'integer' },
};

const PERIOD_MONTH_QUERY_PARAMETER: OpenApiParameter = {
  name: 'month',
  in: 'query',
  schema: { type: 'integer' },
};

const PERIOD_DAY_QUERY_PARAMETER: OpenApiParameter = {
  name: 'day',
  in: 'query',
  schema: { type: 'integer' },
};

const PATCH_OPERATION_HEADER_PARAMETER: OpenApiParameter = {
  name: 'Operation',
  in: 'header',
  schema: {
    type: 'string',
    enum: ['append', 'prepend', 'replace', 'delete'],
    default: 'replace',
  },
};

function cloneParameter(parameter: OpenApiParameter): OpenApiParameter {
  return {
    ...parameter,
    schema: { ...parameter.schema },
  };
}

export function createPathParameter(description?: string): OpenApiParameter {
  return {
    name: 'path',
    in: 'path',
    required: true,
    schema: { type: 'string' },
    ...(description ? { description } : {}),
  };
}

export function createSearchPaginationScopeParameters(
  middleParameters: OpenApiParameter[] = [],
): OpenApiParameter[] {
  return [
    cloneParameter(SEARCH_LIMIT_QUERY_PARAMETER),
    cloneParameter(SEARCH_OFFSET_QUERY_PARAMETER),
    ...middleParameters.map(cloneParameter),
    cloneParameter(SEARCH_BASE_PATH_QUERY_PARAMETER),
  ];
}

export function createPeriodicParameters(
  extraParameters: OpenApiParameter[] = [],
): OpenApiParameter[] {
  return [
    cloneParameter(PERIOD_PATH_PARAMETER),
    cloneParameter(PERIOD_YEAR_QUERY_PARAMETER),
    cloneParameter(PERIOD_MONTH_QUERY_PARAMETER),
    cloneParameter(PERIOD_DAY_QUERY_PARAMETER),
    ...extraParameters.map(cloneParameter),
  ];
}

export function createPatchOperationHeaderParameter(): OpenApiParameter {
  return cloneParameter(PATCH_OPERATION_HEADER_PARAMETER);
}

export function createPatchTargetTypeHeaderParameter(
  enumValues: string[],
): OpenApiParameter {
  return {
    name: 'Target-Type',
    in: 'header',
    schema: {
      type: 'string',
      enum: [...enumValues],
    },
  };
}

export function createMarkdownRequestBody() {
  return {
    content: {
      'text/markdown': { schema: { type: 'string' } },
    },
  };
}

export function createMarkdownOrJsonRequestBody() {
  return {
    content: {
      'text/markdown': { schema: { type: 'string' } },
      'application/json': { schema: { type: 'object' } },
    },
  };
}

// ---------------------------------------------------------------------------
// Response factories — reduce duplication in paths-*.ts files
// ---------------------------------------------------------------------------

/**
 * Create a JSON response with an inline schema.
 * Use for responses that define properties directly (not via $ref).
 */
export function createJsonResponse(description: string, properties: Record<string, unknown>) {
  return {
    description,
    content: {
      'application/json': {
        schema: { type: 'object', properties },
      },
    },
  };
}

/**
 * Create a JSON response referencing a component schema.
 * Use for responses that use `$ref` to a shared schema definition.
 */
export function createJsonRefResponse(description: string, ref: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: ref },
      },
    },
  };
}
