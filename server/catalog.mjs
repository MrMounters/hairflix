export const DEPOSIT_CENTS = 500;
export const TIME_ZONE = 'America/Phoenix';
export const HOLD_SECONDS = 35 * 60;
export const CHECKOUT_SECONDS = 30 * 60;
export const LOCATIONS = [
 {id:'university',name:'Hairflix · University',city:'Tempe',phone:'+14805594539',address:'1301 E University Dr, Unit 136, Tempe, AZ 85288',hours:[[450,1260],[480,1320],[480,1320],[450,1320],[450,1320],[450,1320],[450,1260]]},
 {id:'apache',name:'Hairflix by Vodi · Apache',city:'Tempe',phone:'+16028605995',address:'922 E Apache Blvd, Suite 108, Tempe, AZ 85281',hours:Array.from({length:7},()=>[600,1320])},
 {id:'scottsdale',name:'Hairflix · Scottsdale',city:'Scottsdale',phone:'+16027851988',address:'7349 N Vía Paseo Del Sur, Suite 520, Scottsdale, AZ 85258',hours:Array.from({length:7},()=>[540,1080])}
];
// University prices/durations are from Hairflix's published SQUIRE menu.
// Other shop menus are not inferred from the University listing.
export const SERVICES = [
 {id:'skin-fade',name:'Skin fade',durationMins:35,priceCents:3700},
 {id:'regular-haircut',name:'Regular haircut',durationMins:30,priceCents:3300},
 {id:'hot-towel-beard',name:'Hot-towel beard',durationMins:15,priceCents:2500},
 {id:'ear-nose-wax',name:'Ear & nose wax',durationMins:15,priceCents:1200},
 {id:'perm',name:'Perm & curls',durationMins:60,priceCents:14000},
 {id:'hair-color',name:'Short-hair color',durationMins:30,priceCents:2500},
 {id:'hydra-facial',name:'Hydra facial',durationMins:45,priceCents:12000},
 {id:'eyebrow-lineup',name:'Brow line-up',durationMins:15,priceCents:1500}
];
export function serviceForLocation(serviceId, locationId, overrides={}) {
 const service=SERVICES.find(x=>x.id===serviceId);
 if(!service)return null;
 const override=overrides?.[locationId]?.[serviceId];
 const price=override?.priceCents ?? (locationId==='university'?service.priceCents:null);
 const duration=override?.durationMins ?? service.durationMins;
 return {...service,priceCents:Number.isInteger(price)&&price>=DEPOSIT_CENTS?price:null,durationMins:Number.isInteger(duration)&&duration>=5&&duration<=240?duration:service.durationMins};
}
