export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class QuotaExceededError extends Error {
  constructor(message = 'Quota exceeded') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}
