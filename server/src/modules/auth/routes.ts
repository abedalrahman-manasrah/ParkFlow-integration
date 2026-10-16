import { z } from 'zod';
import { api,route,empty,id,text,money,geo,limit,admins,operators,officers,user,param,actor,key } from '../../apiRegistry';
import * as authentication from '../../modules/auth/service';
import { env } from '../../config/env';
import * as users from '../../modules/users/service';
import * as vehicles from '../../modules/vehicles/service';
import * as parking from '../../modules/parking/service';
import * as sessions from '../../modules/sessions/service';
import * as wallet from '../../modules/wallet/service';
import * as roads from '../../modules/roads/service';
import * as trust from '../../modules/trust/service';
import * as violations from '../../modules/violations/service';
import * as notifications from '../../modules/notifications/service';
import * as admin from '../../modules/admin/service';
import { routingService } from '../../modules/routing/service';
const email=z.object({email:z.string().trim().toLowerCase().pipe(z.email().max(254))}).strict();
route('post','/auth/request-otp',email,(r,b)=>env.NODE_ENV==='development'&&env.DEV_SKIP_EMAIL_OTP
 ? authentication.devLogin(b,{ip:r.ip,device:r.get('user-agent')?.slice(0,500)})
 : authentication.requestOtp(b),false);
route('post','/auth/verify-otp',z.object({challengeId:z.string().uuid(),code:z.string().regex(/^\d{6}$/)}).strict(),(r,b)=>authentication.verifyOtp(b,{ip:r.ip,device:r.get('user-agent')?.slice(0,500)}),false);
route('post','/auth/dev-login',email,(r,b)=>authentication.devLogin(b,{ip:r.ip,device:r.get('user-agent')?.slice(0,500)}),false);
route('post','/auth/refresh',z.object({refreshToken:z.string().max(4096)}).strict(),(r,b)=>authentication.refresh(b.refreshToken,{ip:r.ip,device:r.get('user-agent')?.slice(0,500)}),false);
route('post','/auth/logout',empty,r=>authentication.logout(user(r),r.auth!.sid));
route('post','/auth/logout-all',empty,r=>authentication.logout(user(r),r.auth!.sid,true));
route('get','/auth/me',empty,r=>users.getUser(user(r)));
route('get','/users/me',empty,r=>users.getUser(user(r)));
route('patch','/users/me',z.object({fullName:text.optional(),locale:z.enum(['en','ar']).optional(),gender:z.enum(['female','male']).optional()}).strict(),(r,b)=>users.updateUser(user(r),b));
route('get','/users/me/notification-preferences',empty,r=>users.preferences(user(r)));
route('patch','/users/me/notification-preferences',z.object({parkingReminders:z.boolean(),expiryWarnings:z.boolean(),lowBalance:z.boolean(),violations:z.boolean(),promotions:z.boolean()}).strict(),(r,b)=>users.updatePreferences(user(r),b));
