function clamp(n,a,b){return Math.max(a,Math.min(b,n))}
function scoreEvent(event){
 const rows=[];
 for(const b of event.bookmakers||[]) for(const m of b.markets||[]) if(m.key==="h2h")
  for(const o of m.outcomes||[]) if(Number(o.price)>1) rows.push({name:o.name,price:Number(o.price),bookmaker:b.title});
 if(!rows.length)return null;
 const groups={};
 for(const x of rows)(groups[x.name]??=[]).push(x);
 const candidates=Object.entries(groups).map(([name,a])=>{
  const avg=a.reduce((s,x)=>s+x.price,0)/a.length, min=Math.min(...a.map(x=>x.price)), max=Math.max(...a.map(x=>x.price));
  const spread=avg?(max-min)/avg:1, coverage=clamp(a.length/6,0,1);
  const confidence=clamp(55+coverage*25-spread*100,0,100);
  return {selection:name,averageOdds:+avg.toFixed(3),bestOdds:+max.toFixed(3),bookmakers:a.length,confidence:+confidence.toFixed(1),impliedProbability:+(100/avg).toFixed(1)};
 }).sort((a,b)=>b.confidence-a.confidence);
 const p=candidates[0];
 return {eventId:event.id,sportKey:event.sport_key,sportTitle:event.sport_title,commenceTime:event.commence_time,homeTeam:event.home_team,awayTeam:event.away_team,prediction:p,eligible:p.confidence>=72};
}
function rankEvents(events){return events.map(scoreEvent).filter(Boolean).filter(x=>x.eligible).sort((a,b)=>b.prediction.confidence-a.prediction.confidence)}
module.exports={scoreEvent,rankEvents};
