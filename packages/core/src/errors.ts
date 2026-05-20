/**
 * Error raised when a client-supplied input violates a business rule that
 * Zod can't express on its own (e.g. referencing a row that doesn't exist,
 * or an illegal hierarchy move). The API maps it to HTTP 400; it stays a
 * plain `Error` subclass so other callers (the MCP) keep working unchanged.
 */
export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}
