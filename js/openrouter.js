(function(){
"use strict";

const API_URL="https://openrouter.ai/api/v1/chat/completions";

const MODELS={
  text:"google/gemini-2.5-flash-lite",
  vision:"google/gemini-2.5-flash",
  audio:"openai/gpt-4o-mini-audio-preview",
  fallback:"openai/gpt-4o-mini"
};

const SYSTEM_PROMPT=[
"당신은 견적서 자동입력 변환기입니다.",
"사용자의 자연어(텍스트/음성 전사/이미지)에서 견적 정보만 추출해, 아래 JSON 스키마에 정확히 맞는 JSON 하나만 출력하세요.",
"",
"규칙:",
"1. 출력은 JSON 객체 하나뿐입니다. 코드펜스, 설명, 주석, 양식 문구를 절대 만들지 마세요. 값만 제공합니다.",
"2. 금액(수량, 단가)은 정수입니다. 예: 50000",
"3. taxIncluded가 true이면 사용자가 말한 단가가 부가세 포함 금액이라는 뜻이며, 시스템이 별도 금액으로 환산하므로 단가는 사용자가 말한 값 그대로 넣으세요. 별도/불명이면 false.",
"4. unit은 품목 단위이며 없으면 \"개\"를 사용하세요. 예: 개, 세트, 식, 장",
"5. 날짜는 YYYY-MM-DD로 출력하세요. \"10월 20일\"처럼 연도가 없으면 제공된 오늘 날짜의 연도를 사용하세요.",
"6. 사용자가 견적일을 정하지 않았으면 issueDate에 오늘 날짜를 넣으세요.",
"7. 유효기간을 모르면 validUntil은 빈 문자열로 두세요(시스템이 기본값을 적용합니다).",
"8. 없는 값은 모두 빈 문자열(\"\") 또는 0으로 두고, 임의로 만들어내지 마세요.",
"9. 품목은 최대 20개까지 추출하세요.",
"10. 견적 관련 정보가 전혀 없으면 모든 값을 빈 값으로 두세요.",
"",
"스키마:",
"{",
'  "docNumber": "문서번호, 없으면 빈 문자열",',
'  "issueDate": "YYYY-MM-DD",',
'  "clientName": "견적 받을 고객 담당자 또는 상호 (귀하 앞에 들어갈 이름)",',
'  "validUntil": "견적 유효기간 텍스트",',
'  "supplierBizNo": "공급자 사업자등록번호",',
'  "supplierCeo": "공급자 대표자명",',
'  "supplierCompany": "공급자 상호",',
'  "supplierAddress": "공급자 주소",',
'  "supplierPhone": "공급자 연락처",',
'  "supplierBizType": "업태",',
'  "supplierBizItem": "종목",',
'  "items": [ { "name": "품목명", "spec": "규격 및 사양", "qty": 1, "unit": "개", "unitPrice": 0, "note": "비고" } ],',
'  "taxIncluded": false,',
'  "account": "입금 계좌번호 (은행명 포함)",',
'  "manager": "작성 담당자",',
'  "notes": "기타 비고 (납기일, 결제조건 등 포함)"',
"}"
].join("\n");

function headers(apiKey){
  const h={
    "Authorization":"Bearer "+apiKey,
    "Content-Type":"application/json",
    "X-Title":"Quote Auto-Input AI"
  };
  if(location.origin&&location.origin.indexOf("http")===0){
    h["HTTP-Referer"]=location.origin;
  }
  return h;
}

function pickModel(choice,hasImage){
  if(choice&&choice!=="auto")return choice;
  return hasImage?MODELS.vision:MODELS.text;
}

function buildContent(text,image){
  const today=new Date().toISOString().slice(0,10);
  const intro="오늘 날짜: "+today+"\n아래 입력을 견적서 JSON으로 변환하세요.";
  const body=text&&text.trim()
    ?intro+"\n\n[사용자 입력]\n"+text.trim()
    :intro+"\n\n첨부된 이미지에서 견적 정보를 추출하세요.";
  const parts=[{type:"text",text:body}];
  if(image)parts.push({type:"image_url",image_url:{url:image}});
  return parts;
}

async function chat(apiKey,model,content,maxTokens){
  const ctrl=new AbortController();
  const timer=setTimeout(function(){ctrl.abort();},60000);
  try{
    const res=await fetch(API_URL,{
      method:"POST",
      headers:headers(apiKey),
      signal:ctrl.signal,
      body:JSON.stringify({
        model:model,
        temperature:0.1,
        max_tokens:maxTokens||2500,
        messages:[
          {role:"system",content:SYSTEM_PROMPT},
          {role:"user",content:content}
        ]
      })
    });
    if(!res.ok){
      let msg="API 오류 ("+res.status+")";
      try{
        const err=await res.json();
        if(err&&err.error&&err.error.message)msg=err.error.message;
      }catch(e){}
      const ex=new Error(msg);
      ex.status=res.status;
      throw ex;
    }
    const data=await res.json();
    const text=data&&data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content||"";
    return text;
  }finally{
    clearTimeout(timer);
  }
}

function extractJson(text){
  const t=String(text||"").trim();
  const fence=t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body=fence?fence[1]:t;
  const start=body.indexOf("{");
  const end=body.lastIndexOf("}");
  if(start===-1||end===-1||end<=start)throw new Error("모델이 JSON을 반환하지 않았습니다");
  return JSON.parse(body.slice(start,end+1));
}

async function convertToQuote(opts){
  const apiKey=opts.apiKey;
  const choice=opts.choice||"auto";
  const image=opts.image||null;
  const model=pickModel(choice,!!image);
  const content=buildContent(opts.text,image);
  try{
    const raw=await chat(apiKey,model,content);
    return {data:extractJson(raw),modelUsed:model};
  }catch(err){
    if(choice==="auto"&&model!==MODELS.fallback){
      const raw=await chat(apiKey,MODELS.fallback,content);
      return {data:extractJson(raw),modelUsed:MODELS.fallback,fallbackReason:err.message};
    }
    throw err;
  }
}

function blobToB64(blob){
  return new Promise(function(resolve,reject){
    const r=new FileReader();
    r.onload=function(){resolve(String(r.result).split(",")[1]);};
    r.onerror=function(){reject(new Error("오디오 파일을 읽지 못했습니다"));};
    r.readAsDataURL(blob);
  });
}

async function transcribeAudio(apiKey,blob){
  const data=await blobToB64(blob);
  const raw=await chat(apiKey,MODELS.audio,[
    {type:"text",text:"다음 오디오를 한국어 자연어로 정확히 전사하세요. 전사 텍스트만 출력하고 다른 설명은 하지 마세요."},
    {type:"input_audio",input_audio:{data:data,format:"webm"}}
  ],800);
  return String(raw||"").trim();
}

window.QuoteAI={
  convertToQuote:convertToQuote,
  transcribeAudio:transcribeAudio,
  MODELS:MODELS
};
})();
