import type { IncomingMessage, ServerResponse } from 'node:http'
export function toNodeHandler(auth: { handle(request: Request): Promise<Response> }): (req: IncomingMessage, res: ServerResponse, next?: (error?: unknown) => void) => Promise<void>
export function toRequest(req: IncomingMessage): Promise<Request>
