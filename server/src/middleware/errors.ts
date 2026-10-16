import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/errors';
import { logger } from '../config/logger';
export const errors:ErrorRequestHandler=(err,req,res,_next)=>{
 if(err instanceof ZodError){res.status(400).json({error:{code:'VALIDATION',message:'Invalid request',details:err.flatten()}});return;}
 if(err instanceof ApiError){res.status(err.status).json({error:{code:err.code,message:err.message,details:err.details}});return;}
 if(err instanceof Prisma.PrismaClientKnownRequestError&&['P2002','P2003','P2025'].includes(err.code)){res.status(err.code==='P2025'?404:409).json({error:{code:err.code==='P2025'?'NOT_FOUND':'CONFLICT',message:'The record is missing or conflicts with existing data'}});return;}
 if(err?.code==='LIMIT_FILE_SIZE'){res.status(413).json({error:{code:'INVALID_UPLOAD',message:'Maximum file size is 5 MB'}});return;}
 if(err?.type==='entity.parse.failed'){res.status(400).json({error:{code:'VALIDATION',message:'Invalid JSON'}});return;}
 logger.error({err,requestId:req.id},'Request failed');res.status(500).json({error:{code:'INTERNAL_ERROR',message:'The request could not be completed'}});
};
