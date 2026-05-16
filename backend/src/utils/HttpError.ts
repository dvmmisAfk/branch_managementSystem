export class HttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}
