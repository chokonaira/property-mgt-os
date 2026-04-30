import type { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';

const HEADER = 'x-request-id';
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header(HEADER);
  const id = incoming && SAFE_ID.test(incoming) ? incoming : uuid();
  req.headers[HEADER] = id;
  res.setHeader(HEADER, id);
  next();
}
