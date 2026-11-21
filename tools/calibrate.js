// Breckenridge forecast recalibration. Run inside a browser tab on any normal https page.
// Starts in the background; poll window.__CAL until status is 'done' or 'error'.
// Result: window.__CAL.result = new CAL object for breck-forecast.html (same shape as the page's CAL line).
window.__CAL={status:'running',log:[],started:new Date().toISOString()};
(async()=>{try{
const log=m=>window.__CAL.log.push(m);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CUR=window.__CUR_CAL;                       // current CAL from the page, set by the caller
// Breck season snowfall as reported by the resort (OnTheSnow). Caller may add newer seasons via window.__RESORT_EXTRA.
const RESORT=Object.assign({2016:279,2017:271,2018:387,2019:280,2020:284,2021:265,2022:287,2023:333,2024:290,2025:149},window.__RESORT_EXTRA||{});
const BP=[{k:'base',lat:39.48637,lon:-106.04314,m:2926},{k:'mid',lat:39.4740,lon:-106.0900,m:3353}];
const BM=['gfs_hrrr','ncep_nbm_conus','ecmwf_ifs','gfs_global','icon_seamless','gem_seamless'];
const W={gfs_hrrr:.35,ncep_nbm_conus:.25,ecmwf_ifs:.20,gfs_global:.10,icon_seamless:.05,gem_seamless:.05};
const END=new Date(Date.now()-3*864e5).toISOString().slice(0,10),START='2016-10-01';
async function getJ(u){for(let t=0;t<8;t++){try{const r=await fetch(u);const j=await r.json();if(j&&j.error){log('retry: '+j.reason);await sleep(12000);continue}return j}catch(e){log('fetch error: '+e);await sleep(6000)}}throw new Error('gave up on '+u.split('?')[0])}
const addD=(ds,n)=>{const d=new Date(ds+'T12:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const season=ds=>{const y=+ds.slice(0,4),m=+ds.slice(5,7);return m>=10?y:y-1};

// 1. Breckenridge co-op observations
const coop=await getJ(`https://www.ncei.noaa.gov/access/services/data/v1?dataset=daily-summaries&stations=USC00050909&startDate=${START}&endDate=${END}&dataTypes=SNOW,PRCP&units=standard&format=json`);
log('coop days '+coop.length+' last '+coop[coop.length-1].DATE);

// 2. Past model forecasts, 5-year chunks
const chunks=[];for(let y=2016;;y+=5){const a=`${y}-10-01`,b=`${y+5}-09-30`;chunks.push([a,b<END?b:END]);if(b>=END)break}
const H={};
for(const p of BP)for(const m of BM){const h={time:[],P:[],T:[]};
  for(const [a,b] of chunks){const j=await getJ(`https://historical-forecast-api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&elevation=${p.m}&cell_selection=nearest&start_date=${a}&end_date=${b}&hourly=precipitation,temperature_2m&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FDenver&models=${m}`);
    const q=j.hourly;h.time.push(...q.time);h.P.push(...(q['precipitation_'+m]||q.precipitation));h.T.push(...(q['temperature_2m_'+m]||q.temperature_2m));await sleep(1500)}
  h.idx={};h.time.forEach((t,i)=>h.idx[t]=i);H[p.k+'|'+m]=h;log('got '+p.k+' '+m)}

// 24h window ending 08:00 local on the observation date
const win=(pk,m,D)=>{const h=H[pk+'|'+m];let s=0;for(let k=-23;k<=0;k++){let hh=8+k,d=D;while(hh<0){hh+=24;d=addD(d,-1)}const i=h.idx[d+'T'+String(hh).padStart(2,'0')+':00'];if(i==null)return null;const v=h.P[i];if(v==null)return null;s+=v}return s};
const rows=[];for(const d of coop){const mo=+d.DATE.slice(5,7);if(!(mo>=11||mo<=4)||d.PRCP===''||d.PRCP==null)continue;
  const r={d:d.DATE,s:season(d.DATE),o:+d.PRCP,sn:d.SNOW===''||d.SNOW==null?null:+d.SNOW,m:{},mm:{}};for(const m of BM){r.m[m]=win('base',m,d.DATE);r.mm[m]=win('mid',m,d.DATE)}rows.push(r)}

// 3. Per-model water factors: geometric mean of (all-days ratio) and (ratio on days the model forecast >=0.1")
const fitF=tr=>{const f={},n={};for(const m of BM){const rr=tr.filter(r=>r.m[m]!=null);const ww=rr.filter(r=>r.m[m]>=.1);n[m]=new Set(rr.map(r=>r.s)).size;
  if(rr.length<60||ww.length<15){f[m]=null;continue}const a=rr.reduce((q,r)=>q+r.o,0)/rr.reduce((q,r)=>q+r.m[m],0),b=ww.reduce((q,r)=>q+r.o,0)/ww.reduce((q,r)=>q+r.m[m],0);f[m]=Math.min(2,Math.max(.6,Math.sqrt(a*b)))}return {f,n}};
const full=fitF(rows);
// 4. Held-out test, one winter at a time
const blend=(r,f)=>{let s=0,sw=0;for(const m in W){if(r.m[m]!=null){s+=W[m]*r.m[m]*(f&&f[m]!=null?f[m]:1);sw+=W[m]}}return sw?s/sw:null};
const seasons=[...new Set(rows.map(r=>r.s))].sort();let improved=0,of=0;
for(const s of seasons){const te=rows.filter(r=>r.s===s&&r.o>=.3);if(te.length<5)continue;const f=fitF(rows.filter(r=>r.s!==s)).f;let o=0,b0=0,b1=0;for(const r of te){const a=blend(r,null),b=blend(r,f);if(a==null)continue;o+=r.o;b0+=a;b1+=b}if(!o)continue;of++;if(Math.abs(Math.log(b1/o))<Math.abs(Math.log(b0/o)))improved++}
log('cv '+improved+'/'+of);

// 5. Snow ratio by model temperature at the base during precipitation
const TM=['ecmwf_ifs','gfs_hrrr','gfs_global','ncep_nbm_conus'];
const wetT=D=>{let st=0,sw=0,all=0,na=0;for(let k=-23;k<=0;k++){let hh=8+k,d=D;while(hh<0){hh+=24;d=addD(d,-1)}const key=d+'T'+String(hh).padStart(2,'0')+':00';let ts=0,tn=0,p=0,pn=0;
  for(const m of TM){const h=H['base|'+m];const i=h.idx[key];if(i==null)continue;if(h.T[i]!=null){ts+=h.T[i];tn++}if(h.P[i]!=null){p+=h.P[i];pn++}}if(!tn)continue;const T=ts/tn,P=pn?p/pn:0;all+=T;na++;if(P>.002){st+=T*P;sw+=P}}return sw>.01?st/sw:(na?all/na:null)};
const sp=[];for(const r of rows){if(r.o<.1||r.sn==null)continue;const T=wetT(r.d);if(T!=null)sp.push({T,o:r.o,sn:r.sn})}
const bins=[[-60,10,3],[10,15,12.5],[15,20,17.5],[20,24,22],[24,28,26],[28,31,29.5],[31,34,32.5],[34,38,36],[38,70,40]];
let slr=[];for(const [a,b,c] of bins){const q=sp.filter(p=>p.T>=a&&p.T<b);if(q.length<10)continue;slr.push([c,+(q.reduce((x,p)=>x+p.sn,0)/q.reduce((x,p)=>x+p.o,0)).toFixed(1)])}
if(slr.length>=5)slr=[[-10,slr[0][1]],...slr];else slr=CUR?CUR.slr:slr;
const slrF=T=>{if(T<=slr[0][0])return slr[0][1];for(let i=1;i<slr.length;i++){const[a,b]=slr[i-1],[c,d]=slr[i];if(T<=c)return b+(d-b)*(T-a)/(c-a)}return slr[slr.length-1][1]};
const frac=T=>T<=34?1:T>=40?0:(40-T)/6;

// 6. Elevation factor: resort/town snow vs model mid/base snow
const town={};for(const d of coop){const mo=+d.DATE.slice(5,7);if(!(mo>=10||mo<=5))continue;const s=season(d.DATE);town[s]=(town[s]||0)+(+d.SNOW||0)}
const rs=Object.keys(RESORT).filter(k=>town[k]>50);const resortRatio=rs.reduce((q,k)=>q+RESORT[k],0)/rs.reduce((q,k)=>q+town[k],0);
const f=full.f;let sb=0,sm=0;const tb=H['base|ecmwf_ifs'].time;
for(let i=0;i<tb.length;i++){const mo=+tb[i].slice(5,7);if(!(mo>=11||mo<=5))continue;const pw=pk=>{let s=0,sw=0;for(const m in W){const h=H[pk+'|'+m];const j=h.idx[tb[i]];if(j==null||h.P[j]==null)continue;s+=W[m]*h.P[j]*(f[m]??1);sw+=W[m]}return sw?s/sw:null};
  const tt=pk=>{let s=0,n=0;for(const m of TM){const h=H[pk+'|'+m];const j=h.idx[tb[i]];if(j!=null&&h.T[j]!=null){s+=h.T[j];n++}}return n?s/n:null};
  const pb=pw('base'),pm=pw('mid'),Tb=tt('base'),Tm=tt('mid');if(pb==null||pm==null||Tb==null||Tm==null)continue;sb+=pb*frac(Tb)*slrF(Tb);sm+=pm*frac(Tm)*slrF(Tm)}
const modelRatio=sm/sb;const elev=Math.min(1.5,Math.max(1,resortRatio/modelRatio));

// 7. Assemble, keeping the current value for any model without enough history
const r2=x=>+(+x).toFixed(2);const keep=(id,k)=>CUR&&CUR.models[id]?CUR.models[id][k]:1;
const M={},nf=full.n;
const one=(id,src,k)=>full.f[src]!=null?r2(full.f[src]):keep(id,k);
M.gfs_hrrr={f1:one('gfs_hrrr','gfs_hrrr','f1'),f2:one('gfs_hrrr','gfs_hrrr','f2'),winters:nf.gfs_hrrr};
M.ncep_nbm_conus={f1:one('ncep_nbm_conus','ncep_nbm_conus','f1'),f2:one('ncep_nbm_conus','ncep_nbm_conus','f2'),winters:nf.ncep_nbm_conus};
M.ecmwf_ifs={f1:one('ecmwf_ifs','ecmwf_ifs','f1'),f2:one('ecmwf_ifs','ecmwf_ifs','f2'),winters:nf.ecmwf_ifs};
M.gfs_seamless={f1:M.gfs_hrrr.f1,f2:one('gfs_seamless','gfs_global','f2'),winters:nf.gfs_global};
M.icon_seamless={f1:one('icon_seamless','icon_seamless','f1'),f2:one('icon_seamless','icon_seamless','f2'),winters:nf.icon_seamless};
M.gem_seamless={f1:one('gem_seamless','gem_seamless','f1'),f2:one('gem_seamless','gem_seamless','f2'),winters:nf.gem_seamless};
const first=seasons[0],last=seasons[seasons.length-1];const yy=s=>`${s}–${String(s+1).slice(2)}`;
window.__CAL.result={updated:new Date().toISOString().slice(0,10),winters:`${yy(first)} to ${yy(last)}`,models:M,ens:{ecmwf:M.ecmwf_ifs.f1,gefs:M.gfs_seamless.f2},
  elev:r2(elev),resortRatio:r2(resortRatio),modelRatio:r2(modelRatio),slr:slr.map(([a,b])=>[a,+b]),slrDays:sp.length,cv:{improved,of}};
window.__CAL.status='done';
}catch(e){window.__CAL.status='error';window.__CAL.error=''+e}})();
'started'
