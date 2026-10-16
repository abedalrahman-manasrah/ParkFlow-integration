import nodemailer from 'nodemailer';
import { env } from '../config/env';

export interface EmailProvider {
 sendOtp(to:string,code:string):Promise<void>;
}

export class SmtpEmailProvider implements EmailProvider {
 private transport?: ReturnType<typeof nodemailer.createTransport>;
 async sendOtp(to:string,code:string){
  if(!env.SMTP_PASSWORD) throw new Error('SMTP credentials are not configured');
  this.transport ??= nodemailer.createTransport({
   host:env.SMTP_HOST,port:env.SMTP_PORT,secure:env.SMTP_SECURE,requireTLS:true,
   auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},
   connectionTimeout:10000,greetingTimeout:10000,socketTimeout:20000,
  });
  const result=await this.transport.sendMail({
   from:{name:'ParkFlow',address:env.EMAIL_FROM},to,
   subject:'Your ParkFlow verification code',
   text:`Your ParkFlow verification code is ${code}. It expires in 5 minutes. Do not share this code. If you did not request it, ignore this email.`,
  });
  if(!result.accepted.length || result.rejected.length) throw new Error('Email delivery rejected');
 }
}

// Add future provider implementations here; authentication depends only on the interface.
export const emailProvider:EmailProvider=new SmtpEmailProvider();
