/** Error with a stable string code (`data.code` on the wire) and an optional fix hint. */
export class EngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly hint?: string,
  ) {
    super(message);
  }
}
