import type { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';

const HEADER = 'x-request-id';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header(HEADER);
  const id = incoming && incoming.length <= 128 ? incoming : uuid();
  req.headers[HEADER] = id;
  res.setHeader(HEADER, id);
  next();
}
