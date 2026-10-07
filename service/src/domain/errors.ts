/**
 * Domain errors carry a machine-readable code and a message written for the
 * person (or agent) who hit them. A refusal that doesn't say what to do instead
 * is how a gate becomes something people route around.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly detail?: unknown,
  ) {
    super(message)
    this.name = 'DomainError'
  }
}

export const notFound = (what: string, id: string) =>
  new DomainError('not_found', `${what} ${id} not found`, 404)

export const conflict = (message: string, detail?: unknown) =>
  new DomainError('conflict', message, 409, detail)

export const invalid = (message: string, detail?: unknown) =>
  new DomainError('invalid', message, 400, detail)
