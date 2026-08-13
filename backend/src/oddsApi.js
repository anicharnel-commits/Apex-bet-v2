const {oddsApiKey,oddsApiBase}=require("./config");
async function request(path,params={}){
 if(!oddsApiKey) throw Object.assign(new Error("ODDS_API_KEY is not configured"),{status:500});
 const u=new URL(oddsApiBase+path); u.searchParams.set("apiKey",oddsApiKey);
 for(const [k,v] of Object.entries(params)) if(v!=null) u.searchParams.set(k,v);
 const r=await fetch(u); const text=await r.text(); let data;
 try{data=JSON.parse(text)}catch{data={raw:text}}
 if(!r.ok) throw Object.assign(new Error(data?.message||`Odds API HTTP ${r.status}`),{status:r.status});
 return {data,headers:Object.fromEntries(r.headers.entries())};
}
async function getSports(){return request("/sports")}
async function getEvents(sport){return request(`/sports/${encodeURIComponent(sport)}/odds`,{regions:"eu,us",markets:"h2h,totals",oddsFormat:"decimal",dateFormat:"iso"})}
module.exports={getSports,getEvents};
