(function(){
"use strict";

function apiBase(){
  const base=(window.APP_CONFIG&&window.APP_CONFIG.API_BASE)||"";
  return String(base).replace(/\/+$/,"");
}

async function post(path,payload){
  const res=await fetch(apiBase()+path,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload)
  });
  let data=null;
  try{data=await res.json();}catch(e){}
  if(!res.ok){
    const ex=new Error((data&&data.error)||("요청 실패 ("+res.status+")"));
    ex.status=res.status;
    throw ex;
  }
  return data;
}

async function convertToQuote(opts){
  const res=await post("/api/convert",{
    text:opts.text||"",
    image:opts.image||null,
    model:opts.choice||"auto"
  });
  return {
    data:res.data,
    modelUsed:res.modelUsed||"",
    fallbackReason:res.fallbackReason
  };
}

async function transcribeAudio(blob){
  const b64=await new Promise(function(resolve,reject){
    const r=new FileReader();
    r.onload=function(){resolve(String(r.result).split(",")[1]);};
    r.onerror=function(){reject(new Error("오디오 파일을 읽지 못했습니다"));};
    r.readAsDataURL(blob);
  });
  const res=await post("/api/transcribe",{audio:b64,format:"webm"});
  return String(res.text||"").trim();
}

window.QuoteAI={
  convertToQuote:convertToQuote,
  transcribeAudio:transcribeAudio
};
})();
