import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import catalog from './data/catalog.json';
const db=new PrismaClient();
export async function seed(){
 for(const f of catalog.facilities){const {location,availability,...data}=f;await db.parkingFacility.upsert({where:{id:f.id},create:{...data,...location},update:{}});}
 for(const z of catalog.zones){const operatorId='operator-'+z.operatorName.toLowerCase().replace(/[^a-z0-9]+/g,'-');
 // A municipality's garages are still municipal — that decides official violations vs private overstay fees.
 const operatorType=/municipality/i.test(z.operatorName)||z.kind==='street'?'municipality':'garage';await db.parkingOperator.upsert({where:{id:operatorId},create:{id:operatorId,name:z.operatorName,type:operatorType},update:{name:z.operatorName,type:operatorType}});
 const raw=z as typeof z & {facilityId?:string;capacity?:number;ownership?:string;accessRestriction?:string;accessRestrictionAr?:string;parkingAllowed?:boolean;prototypeData?:boolean;accessibleSpots?:number};
 const zoneData={operatorId,facilityId:raw.facilityId,code:z.code,name:z.name,nameAr:z.nameAr,city:z.city,cityAr:z.cityAr,kind:z.kind,...z.location,capacity:raw.capacity,ownership:raw.ownership,accessRestriction:raw.accessRestriction,accessRestrictionAr:raw.accessRestrictionAr,parkingAllowed:raw.parkingAllowed??true,prototypeData:raw.prototypeData??false,accessibleSpots:raw.accessibleSpots??0,supportedModes:z.supportedModes as ('start_stop'|'prepaid')[],defaultMode:z.defaultMode as 'start_stop'|'prepaid',supportedEntryMethods:z.supportedEntryMethods};
 await db.parkingZone.upsert({where:{id:z.id},create:{id:z.id,...zoneData},update:zoneData});
 await db.parkingTariff.upsert({where:{id:z.tariff.id},create:{...z.tariff,zoneId:z.id},update:z.tariff});
 for(const h of z.operatingHours){const closed='closed' in h?(h.closed??false):false;await db.operatingHour.upsert({where:{zoneId_weekday:{zoneId:z.id,weekday:h.weekday}},create:{...h,closed,zoneId:z.id},update:{opensAt:h.opensAt,closesAt:h.closesAt,closed}});}
 // No fabricated occupancy reports, balances, users, or violations are seeded.
 }
 for(const c of catalog.checkpoints){const {location,...rest}=c;await db.roadCheckpoint.upsert({where:{id:c.id},create:{...rest,...location},update:{}});}
 if(process.env.NODE_ENV!=='production'){
  const demoUser=await db.user.upsert({where:{email:'road-reports-demo@parkflow.local'},create:{id:'road-reports-demo-user',email:'road-reports-demo@parkflow.local',emailVerifiedAt:new Date(),fullName:'Demo data (not a real reporter)',wallet:{create:{}}},update:{fullName:'Demo data (not a real reporter)'}});
  const now=Date.now();
  const demos=[
   {id:'demo-road-report-accident',type:'accident' as const,latitude:31.9051,longitude:35.2038,severity:'high' as const,description:'Demo only — sample accident report',minutes:74},
   {id:'demo-road-report-congestion',type:'traffic_congestion' as const,latitude:31.8992,longitude:35.2096,severity:'moderate' as const,direction:'northbound' as const,description:'Demo only — sample congestion report',minutes:24},
   {id:'demo-road-report-construction',type:'construction' as const,latitude:31.9122,longitude:35.1994,severity:'low' as const,direction:'both' as const,description:'Demo only — sample construction report',minutes:720},
   {id:'demo-road-report-hazard',type:'road_hazard' as const,latitude:31.8971,longitude:35.2012,severity:'moderate' as const,description:'Demo only — sample road hazard report',minutes:180},
  ];
  for(const item of demos){const {id,minutes,...data}=item;await db.roadReport.upsert({where:{id},create:{id,reporterUserId:demoUser.id,...data,isDemo:true,expiresAt:new Date(now+minutes*60000)},update:{reporterUserId:demoUser.id,...data,isDemo:true,status:'unverified',confidenceScore:0.35,confirmationCount:0,rejectionCount:0,expiresAt:new Date(now+minutes*60000)}});}
 }
 if(process.env.NODE_ENV!=='production')await seedSharingDemo();
 if(process.env.SEED_ADMIN_EMAIL&&process.env.NODE_ENV!=='production'){const email=process.env.SEED_ADMIN_EMAIL.trim().toLowerCase();await db.user.upsert({where:{email},create:{email,emailVerifiedAt:new Date(),fullName:'Development Admin',role:'ADMIN',wallet:{create:{}}},update:{}});}
}
/** Local demo only: sample hosts and drivers (marked "demo"), shared rides and private spots, plus the quick-login account. */
async function seedSharingDemo(){
 const day=86400000,hour=3600000,now=Date.now();
 const at=(days:number,h:number)=>{const d=new Date(now+days*day);d.setUTCHours(h-3,0,0,0);return d;};// h is local Palestine time (UTC+3)
 const person=async(id:string,email:string,fullName:string,gender:string,plate?:string,make?:string,model?:string,color?:string)=>{
  const u=await db.user.upsert({where:{email},create:{id,email,emailVerifiedAt:new Date(),fullName,firstName:fullName.split(' ')[0]!,gender,wallet:{create:{}}},update:{fullName,gender}});
  if(plate){const plateNumber=plate.replace(/[^0-9]/g,'');// stored as digits only, like the vehicles service does
   const v=await db.vehicle.upsert({where:{plateNumber_region:{plateNumber,region:'PS'}},create:{plateNumber,make,model,color},update:{}});
   await db.userVehicle.upsert({where:{userId_vehicleId:{userId:u.id,vehicleId:v.id}},create:{userId:u.id,vehicleId:v.id,isDefault:true},update:{unlinkedAt:null}});return {user:u,vehicleId:v.id};}
  return {user:u,vehicleId:''};
 };
 const lina=await person('demo-host-lina','lina.demo@parkflow.local','لينا (تجريبي)','female','9-1234-90','Kia','Picanto','White');
 const omar=await person('demo-host-omar','omar.demo@parkflow.local','عمر (تجريبي)','male','7-5521-94','Hyundai','Accent','Silver');
 const sara=await person('demo-host-sara','sara.demo@parkflow.local','سارة (تجريبي)','female','4-8812-95','Skoda','Octavia','Grey');
 const rides=[
  {id:'demo-ride-1',d:omar,fromCity:'Ramallah',toCity:'Nablus',meetingPoint:'دوار المنارة',departAt:at(1,8),seatsTotal:3,pricePerSeat:0,womenOnly:false,notes:'أنطلق في الموعد، حقائب صغيرة فقط.'},
  {id:'demo-ride-2',d:lina,fromCity:'Birzeit',toCity:'Ramallah',meetingPoint:'البوابة الرئيسية لجامعة بيرزيت',departAt:at(1,15),seatsTotal:3,pricePerSeat:0,womenOnly:true,notes:'للنساء فقط. عائدة إلى البيت بعد المحاضرات.'},
  {id:'demo-ride-3',d:sara,fromCity:'Ramallah',toCity:'Bethlehem',meetingPoint:'مجمع رام الله المركزي',departAt:at(2,9),seatsTotal:2,pricePerSeat:0,womenOnly:false,notes:undefined},
  {id:'demo-ride-4',d:omar,fromCity:'Nablus',toCity:'Ramallah',meetingPoint:'البوابة الشرقية للبلدة القديمة في نابلس',departAt:at(2,17),seatsTotal:4,pricePerSeat:0,womenOnly:false,notes:'يمكنني التوقف في حوارة عند الحاجة.'},
  {id:'demo-ride-5',d:lina,fromCity:'Ramallah',toCity:'Jericho',meetingPoint:'بلدية البيرة',departAt:at(4,10),seatsTotal:3,pricePerSeat:0,womenOnly:false,notes:'رحلة نهاية الأسبوع، العودة في نفس المساء.'},
 ];
 for(const r of rides){const {id,d,...data}=r;await db.ride.upsert({where:{id},create:{id,...data,driverId:d.user.id,vehicleId:d.vehicleId},update:{...data,status:'open'}});}
 const everyDay=[0,1,2,3,4,5,6],weekdays=[0,1,2,3,4];
 const spots=[
  {id:'demo-spot-1',hostId:lina.user.id,title:'مدخل مسقوف قرب المنارة',city:'Ramallah',areaHint:'المنارة، 3 دقائق مشياً إلى الدوار',fullAddress:'شارع ركب، عمارة 14، البوابة الزرقاء',latitude:31.9038,longitude:35.2052,covered:true,hourlyRate:600,dailyRate:3500,weekdays:everyDay,availableFrom:'07:00',availableTo:'00:00',instantBook:true},
  {id:'demo-spot-2',hostId:omar.user.id,title:'ساحة في الطيرة',city:'Ramallah',areaHint:'الطيرة، قرب فرع البنك العربي',fullAddress:'شارع الطيرة، بيت 7، الموقف على اليسار',latitude:31.9105,longitude:35.1918,covered:false,hourlyRate:400,dailyRate:2500,weekdays,availableFrom:'08:00',availableTo:'18:00',instantBook:false},
  {id:'demo-spot-3',hostId:sara.user.id,title:'كراج قرب جامعة بيرزيت',city:'Birzeit',areaHint:'بيرزيت، 5 دقائق من بوابة الجامعة',fullAddress:'شارع الجامعة، فيلا بباب أخضر',latitude:31.9592,longitude:35.1835,covered:true,hourlyRate:300,dailyRate:1500,weekdays,availableFrom:'07:00',availableTo:'17:00',instantBook:true},
  {id:'demo-spot-4',hostId:omar.user.id,title:'مدخل قرب مستشفى رفيديا',city:'Nablus',areaHint:'رفيديا، قرب المستشفى',fullAddress:'شارع رفيديا الرئيسي، عمارة 22',latitude:32.2263,longitude:35.2335,covered:false,hourlyRate:500,dailyRate:3000,weekdays:everyDay,availableFrom:'06:00',availableTo:'22:00',instantBook:false},
 ];
 for(const sp of spots){const {id,...data}=sp;await db.hostSpot.upsert({where:{id},create:{id,...data,vehicleSize:'car'},update:data});}
 // The quick-login account: named, with a car and ₪200 of demo credit so booking works out of the box.
 const demo=await person('demo-driver','demo@parkflow.ps','Demo Driver','female','1-2345-96','Toyota','Corolla','Blue');
 // Local demo only: admin, so Gate mode and the patrol check can be shown from the same account.
 await db.user.update({where:{id:demo.user.id},data:{role:'ADMIN'}});
 // A test plate camera at the Municipality Garage. Send events with: X-Gate-Key: pfg_dev_camera_key
 await db.gateDevice.upsert({where:{keyHash:createHash('sha256').update('pfg_dev_camera_key').digest('hex')},create:{parkingZoneId:'zone_municipality',name:'Demo camera (dev only)',kind:'camera',keyHash:createHash('sha256').update('pfg_dev_camera_key').digest('hex')},update:{active:true}});
 const credited=await db.walletTransaction.findUnique({where:{reference:'demo-credit:demo-driver'}});
 if(!credited){const wallet=await db.wallet.findUniqueOrThrow({where:{userId:demo.user.id}});const balance=wallet.balance+20000;
  await db.wallet.update({where:{id:wallet.id},data:{balance}});
  await db.walletTransaction.create({data:{walletId:wallet.id,type:'adjustment',status:'completed',amount:20000,balanceAfter:balance,title:'Demo credit',titleAr:'رصيد تجريبي',reference:'demo-credit:demo-driver'}});}
}
if(require.main===module)seed().then(()=>console.log('Seeded parking catalog, checkpoints, and local demo road reports')).finally(()=>db.$disconnect());
