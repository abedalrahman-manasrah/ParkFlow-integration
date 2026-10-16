import { S3Client,PutObjectCommand,GetObjectCommand,CreateBucketCommand,HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { assert } from '../utils/errors';
const options={region:env.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:env.S3_ACCESS_KEY,secretAccessKey:env.S3_SECRET_KEY}};
export const s3=new S3Client({...options,endpoint:env.S3_ENDPOINT});
const signing=new S3Client({...options,endpoint:process.env.S3_PUBLIC_ENDPOINT||env.S3_ENDPOINT});
export async function ensureBucket(){try{await s3.send(new HeadBucketCommand({Bucket:env.S3_BUCKET}));}catch(e){if(env.NODE_ENV==='production')throw e;await s3.send(new CreateBucketCommand({Bucket:env.S3_BUCKET}));}}
export function validateFile(buffer:Buffer,mime:string){assert(buffer.length>0&&buffer.length<=5*1024*1024,'INVALID_UPLOAD','Files must be between 1 byte and 5 MB');const detected=buffer.subarray(0,3).equals(Buffer.from([255,216,255]))?'image/jpeg':buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))?'image/png':buffer.subarray(0,5).toString()==='%PDF-'?'application/pdf':undefined;assert(detected===mime,'INVALID_UPLOAD','Upload must be a valid JPEG, PNG, or PDF');}
export async function put(key:string,buffer:Buffer,mime:string){validateFile(buffer,mime);await s3.send(new PutObjectCommand({Bucket:env.S3_BUCKET,Key:key,Body:buffer,ContentType:mime,ContentDisposition:'attachment'}));}
export async function signedUrl(key:string){return getSignedUrl(signing,new GetObjectCommand({Bucket:env.S3_BUCKET,Key:key}),{expiresIn:900});}
