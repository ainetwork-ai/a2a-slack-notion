// Standard error envelope (Decision #44)
export interface ApiError {
  object: 'error';
  status: number;
  code: string;
  message: string;
  request_id?: string;
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON(): ApiError {
    return {
      object: 'error',
      status: this.status,
      code: this.code,
      message: this.message,
    };
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'not_found', `${resource} not found: ${id}`);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, 'forbidden', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'validation_error', message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'conflict', message);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, 'rate_limited', 'Too many requests. Please retry after a short delay.');
  }
}
