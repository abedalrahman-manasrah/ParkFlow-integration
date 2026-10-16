import { z } from 'zod';
import { api,route,empty,id,text,money,geo,limit,admins,operators,officers,user,param,actor,key } from '../../apiRegistry';
import * as authentication from '../../modules/auth/service';
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
route('get','/roads/checkpoints',empty,()=>roads.checkpoints());
route('get','/roads/reports',z.object({limit}).strict(),(_r,b)=>roads.feed(b.limit));
route('post','/roads/checkpoints/:id/reports',z.object({status:z.enum(['open','congested','closed'])}).strict(),(r,b)=>roads.reportRoad(user(r),param(r),b.status));
route('post','/parking/zones/:id/reports',z.object({availability:z.enum(['available','limited','full'])}).strict(),(r,b)=>roads.reportZone(user(r),param(r),b.availability));
route('get','/parking/zones/:id/reports',empty,r=>roads.zoneReports(param(r)));
route(
  'post',
  '/routes/plan',
  z.object({
    origin: geo,
    destination: geo,
    mode: z.enum(['checkpoint-aware', 'fastest']).optional(),
    snapDestination: z.boolean().optional(),
    maxAlternatives: z.number().int().min(0).max(2).optional(),
  }).strict(),
  (_r, b) => routingService.getRoute(b.origin, b.destination, b),
);
route('get','/trust/me',empty,r=>trust.computeTrust(user(r)));
route('get','/points/me',empty,async r=>(await trust.computeTrust(user(r))).recent);
