"use strict";(()=>{var e={};e.id=501,e.ids=[501],e.modules={145:e=>{e.exports=require("next/dist/compiled/next-server/pages-api.runtime.prod.js")},79:e=>{e.exports=import("openai")},249:(e,t)=>{Object.defineProperty(t,"l",{enumerable:!0,get:function(){return function e(t,a){return a in t?t[a]:"then"in t&&"function"==typeof t.then?t.then(t=>e(t,a)):"function"==typeof t&&"default"===a?t:void 0}}})},821:(e,t,a)=>{a.a(e,async(e,r)=>{try{a.r(t),a.d(t,{config:()=>u,default:()=>c,routeModule:()=>p});var n=a(802),o=a(153),i=a(249),s=a(770),l=e([s]);s=(l.then?(await l)():l)[0];let c=(0,i.l)(s,"default"),u=(0,i.l)(s,"config"),p=new n.PagesAPIRouteModule({definition:{kind:o.x.PAGES_API,page:"/api/jazzy-chat",pathname:"/api/jazzy-chat",bundlePath:"",filename:""},userland:s});r()}catch(e){r(e)}})},770:(e,t,a)=>{a.a(e,async(e,r)=>{try{a.r(t),a.d(t,{default:()=>i});var n=a(79),o=e([n]);let l=new(n=(o.then?(await o)():o)[0]).default({apiKey:process.env.OPENAI_API_KEY});async function i(e,t){if("POST"!==e.method)return t.status(405).json({error:"Method not allowed"});let{message:a,history:r=[],source:n="chat"}=e.body||{};if(!a)return t.status(400).json({error:"Message is required"});try{let e=`
You are **Jazzy**, an AI Agent working for *Digitalboxes*, acting as the personal virtual assistant of Jahanzaib Ashfaq.

You reply with:
- simple, smart, confident sentences  
- Gen Z-inspired clarity, no cringe  
- No long paragraphs  
- Always solution-focused  
- Never robotic  
- Never overly formal  
- No complex jargon  
- Straight to the point  
- Friendly and human-like  

Main responsibilities:
1. Answer user chat questions  
2. Collect leads (name, email, project)  
3. Prepare email replies (if source = email)  
4. Trigger internal actions using JSON  
5. Speak like a human, not a bot  

Digitalboxes services (for context):
- SEO
- PPC
- Funnels
- AI Tools
- Website Development
- Lead Generation
- Branding
- YouTube & Content Strategy

When the user shows interest in services, ask naturally:
"Want me to grab your name and email so Jahanzaib can reach you?"

ALWAYS respond in valid JSON format ONLY:

{
  "reply": "chat message here",
  "actions": [
    {
      "type": "log_lead" | "mark_urgent" | "prepare_email_reply" | "none",
      "payload": { ... }
    }
  ]
}

Do NOT include backticks.
Do NOT explain JSON.
    `,o=[{role:"system",content:e},...r.map(e=>({role:e.role,content:e.content})),{role:"user",content:"email"===n?`EMAIL RECEIVED: ${a}
Write a full reply email.`:a}],i=(await l.chat.completions.create({model:"gpt-4.1-mini",messages:o,temperature:.4})).choices[0].message.content||"{}",c={reply:"Something went wrong.",actions:[]};try{c=JSON.parse(i)}catch(e){console.error("❌ Failed to parse JSON:",i)}let u=c.reply||"Something went wrong.",p=c.actions||[];for(let e of p)try{await s(e,{message:a,source:n})}catch(e){console.error("❌ Action execution failed:",e)}return t.status(200).json({reply:u,actions:p})}catch(e){return console.error("\uD83D\uDCA5 Jazzy API Error:",e),t.status(500).json({error:e.message||"Server error"})}}async function s(e,t){switch(e.type){case"log_lead":console.log("✨ Logging lead:",e.payload);break;case"mark_urgent":console.log("\uD83D\uDEA8 Urgent message detected:",t.message);break;case"prepare_email_reply":console.log("\uD83D\uDCE7 Email reply prepared:",e.payload)}}r()}catch(e){r(e)}})},153:(e,t)=>{var a;Object.defineProperty(t,"x",{enumerable:!0,get:function(){return a}}),function(e){e.PAGES="PAGES",e.PAGES_API="PAGES_API",e.APP_PAGE="APP_PAGE",e.APP_ROUTE="APP_ROUTE"}(a||(a={}))},802:(e,t,a)=>{e.exports=a(145)}};var t=require("../../webpack-api-runtime.js");t.C(e);var a=t(t.s=821);module.exports=a})();