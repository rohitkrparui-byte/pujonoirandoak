const H={"content-type":"application/json; charset=utf-8","cache-control":"no-store"};
const out=(x,s=200)=>new Response(JSON.stringify(x),{status:s,headers:H});
const enc=encodeURIComponent;
async function db(path,method="GET",body,prefer){
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw Error("Supabase environment variables are missing.");
 const r=await fetch(new URL("/rest/v1/"+path,url),{method,headers:{apikey:key,authorization:"Bearer "+key,"content-type":"application/json",prefer:prefer||"return=representation"},body:body?JSON.stringify(body):undefined});
 const t=await r.text();if(!r.ok)throw Error("Database request failed ("+r.status+"): "+t.slice(0,180));return t?JSON.parse(t):[];
}
const now=()=>new Date().toISOString();
async function question(round,order){return (await db("game_questions?select=round_number,question_order,category,prompt,timer_seconds&round_number=eq."+round+"&question_order=eq."+order+"&is_active=eq.true&limit=1"))[0]||null}
async function publishQuestion(round,order){
 const q=await question(round,order);if(!q)return null;
 const started=now(),deadline=new Date(Date.now()+q.timer_seconds*1000).toISOString();
 await db("game_state?id=eq.1","PATCH",{status:"live",round_number:round,question_order:order,prompt:q.prompt,round_started_at:started,deadline_at:deadline,updated_at:started});
 return {...q,deadline_at:deadline};
}
export default async req=>{
 if(req.method!=="POST")return out({error:"POST required"},405);
 let b;try{b=await req.json()}catch{return out({error:"Invalid JSON"},400)}
 const action=String(b.action||""),hostActions=["host_state","create_session","set_round","start_game","next_question","reveal","score","finish"];
 if(hostActions.includes(action)&&(!process.env.HOST_ACCESS_KEY||req.headers.get("x-host-key")!==process.env.HOST_ACCESS_KEY))return out({error:"Host authorization failed"},401);
 try{
  if(action==="join"||action==="player_state"||action==="submit_answer"){
   const code=String(b.code||"").trim().toUpperCase();if(!/^[A-F0-9]{10}$/.test(code))return out({error:"Enter your 10-character invitation code."},400);
   const inv=await db("invitation_codes?select=application_id&code=eq."+enc(code)+"&status=eq.active&limit=1");if(!inv.length)return out({error:"Invitation code is invalid or inactive."},404);
   const appid=inv[0].application_id;
   if(action==="submit_answer"){
    const answer=String(b.answer||"").trim().slice(0,1000);if(!answer)return out({error:"Please enter an answer."},400);
    const st=(await db("game_state?select=status,round_number,question_order,deadline_at&limit=1"))[0];if(!st||st.status!=="live")return out({error:"The host has not opened a live question."},409);
    if(st.deadline_at&&Date.now()>Date.parse(st.deadline_at))return out({error:"Time is up for this question."},409);
    const prior=await db("game_answers?select=id&application_id=eq."+enc(appid)+"&round_number=eq."+st.round_number+"&question_order=eq."+st.question_order+"&limit=1");if(prior.length)return out({error:"Your answer for this question is already submitted."},409);
    await db("game_answers","POST",{application_id:appid,round_number:st.round_number,question_order:st.question_order,answer});return out({ok:true,message:"Answer submitted. Wait for the next question."});
   }
   const state=(await db("game_state?select=id,session_name,status,round_number,question_order,prompt,round_started_at,deadline_at,total_questions,updated_at&limit=1"))[0]||null;
   const scores=await db("game_scores?select=points&application_id=eq."+enc(appid));const result={state,points:scores.reduce((n,x)=>n+Number(x.points||0),0)};
   if(action==="join"){const apps=await db("applications?select=id,name,partner&id=eq."+enc(appid)+"&status=eq.approved&limit=1");if(!apps.length)return out({error:"Your application is not approved yet."},403);result.valid=true;result.team=apps[0]}
   else result.lastAnswer=(await db("game_answers?select=id,round_number,question_order,answer,submitted_at&application_id=eq."+enc(appid)+"&order=submitted_at.desc&limit=1"))[0]||null;
   return out(result);
  }
  if(action==="host_state"){
   const state=(await db("game_state?select=*&limit=1"))[0]||null;const teams=await db("applications?select=id,name,partner,status&status=eq.approved&order=created_at.asc");
   const scores=await db("game_scores?select=application_id,points"),answers=await db("game_answers?select=id,application_id,round_number,question_order,answer,submitted_at&order=submitted_at.asc");
   const questions=await db("game_questions?select=round_number,question_order,category,prompt,timer_seconds&is_active=eq.true&order=round_number.asc,question_order.asc");
   return out({state,teams:teams.map(t=>({...t,points:scores.filter(s=>s.application_id===t.id).reduce((n,x)=>n+Number(x.points||0),0)})),answers,questions});
  }
  if(action==="create_session"){
   await db("game_state?on_conflict=id","POST",{id:1,session_name:String(b.session_name||"Pujo Secret Society").slice(0,100),status:"waiting",round_number:0,question_order:0,prompt:"",round_started_at:null,deadline_at:null,total_questions:20,updated_at:now()},"resolution=merge-duplicates,return=representation");
   return out({ok:true});
  }
  if(action==="start_game"){const q=await publishQuestion(1,1);if(!q)return out({error:"No active questions found. Check game_questions in Supabase."},409);return out({ok:true,question:q})}
  if(action==="next_question"){
   const st=(await db("game_state?select=round_number,question_order,status&limit=1"))[0];if(!st)return out({error:"Create a session first."},409);
   const nextOrder=Number(st.question_order||0)+1,nextRound=Number(st.round_number||0)+(nextOrder>4?1:0),order=nextOrder>4?1:nextOrder;
   if(nextRound>5){await db("game_state?id=eq.1","PATCH",{status:"finished",deadline_at:null,updated_at:now()});return out({ok:true,finished:true})}
   const q=await publishQuestion(nextRound,order);if(!q)return out({error:"Next question is missing from the question bank."},409);return out({ok:true,question:q});
  }
  if(action==="set_round"){
   const n=Math.max(1,Math.min(5,Number(b.round_number)||1)),order=Math.max(1,Math.min(4,Number(b.question_order)||1)),prompt=String(b.prompt||"").trim().slice(0,1000);if(!prompt)return out({error:"Add a round prompt."},400);
   const started=now();await db("game_state?id=eq.1","PATCH",{status:"live",round_number:n,question_order:order,prompt,round_started_at:started,deadline_at:new Date(Date.now()+60000).toISOString(),updated_at:started});return out({ok:true});
  }
  if(action==="reveal"){await db("game_state?id=eq.1","PATCH",{status:"revealed",deadline_at:null,updated_at:now()});return out({ok:true})}
  if(action==="finish"){await db("game_state?id=eq.1","PATCH",{status:"finished",deadline_at:null,updated_at:now()});return out({ok:true})}
  if(action==="score"){
   const application_id=String(b.application_id||""),points=Math.max(-100,Math.min(100,Number(b.points)||0));if(!application_id)return out({error:"Select a couple."},400);
   await db("game_scores","POST",{application_id,points,note:String(b.note||"Host award").slice(0,150)});return out({ok:true});
  }
  return out({error:"Unknown action"},400);
 }catch(e){console.error(e);return out({error:e.message||"Server error"},500)}
};
