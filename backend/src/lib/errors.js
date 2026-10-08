export class ApiError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export function sendError(res, status, code, message, fields) {
  const error = { code, message };
  if (fields && Object.keys(fields).length) error.fields = fields;
  return res.status(status).json({ error });
}

export function validationFields(zodError) {
  const fields = {};
  for (const issue of zodError.issues ?? []) {
    const key = issue.path.join('.') || 'body';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export function notFound(message = 'The requested resource was not found.') {
  return new ApiError(404, 'NOT_FOUND', message);
}
