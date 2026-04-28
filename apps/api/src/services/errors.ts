import type { NextFunction, Request, Response } from "express";

export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof AppError) {
    return res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  console.error(error);
  return res.status(500).json({
    error: {
      code: "internal_error",
      message: "서버 오류가 발생했습니다."
    }
  });
}
