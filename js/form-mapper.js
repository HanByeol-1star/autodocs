(function(){
"use strict";

const EDITABLE=[
  "docNumber","issueDate","clientName","validUntil",
  "supplierBizNo","supplierCeo","supplierCompany","supplierAddress","supplierPhone",
  "supplierBizType","supplierBizItem",
  "account","manager","notes"
];
const DEFAULTS={validUntil:"발행일로부터 7일"};
const MIN_ROWS=20;
const MAX_ITEMS=20;

function esc(s){
  return String(s==null?"":s).replace(/[&<>"']/g,function(m){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m];
  });
}
function toInt(v){
  const n=parseInt(String(v==null?"":v).replace(/[^0-9\-]/g,""),10);
  return Number.isFinite(n)?n:0;
}
function fmt(n){return Number(n||0).toLocaleString("ko-KR");}

function normalizeDate(v){
  if(!v)return"";
  const s=String(v).trim();
  let m=s.match(/(\d{4})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/);
  if(m)return m[1]+"-"+String(+m[2]).padStart(2,"0")+"-"+String(+m[3]).padStart(2,"0");
  m=s.match(/(?:^|\D)(\d{1,2})[.\-\/월\s]+(\d{1,2})[.\-\/일]/);
  if(m){
    const y=new Date().getFullYear();
    return y+"-"+String(+m[1]).padStart(2,"0")+"-"+String(+m[2]).padStart(2,"0");
  }
  return s;
}
function kDate(iso){
  const m=String(iso||"").match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m?(m[1]+"년 "+(+m[2])+"월 "+(+m[3])+"일"):(iso||"");
}

function numKor(n){
  if(!n||n<=0)return"";
  if(n>=1e12)return"";
  const D=["","일","이","삼","사","오","육","칠","팔","구"];
  const U=["","십","백","천"];
  const B=["","만","억"];
  let out="",x=n,i=0;
  while(x>0){
    const g=x%10000;
    if(g){
      let s="",g2=g,ui=0;
      while(g2>0){
        const d=g2%10;
        if(d){
          const dig=(d===1&&ui>0)?"":D[d];
          s=dig+U[ui]+s;
        }
        g2=Math.floor(g2/10);ui++;
      }
      if(i===1&&g===1)s="";
      out=s+B[i]+out;
    }
    x=Math.floor(x/10000);i++;
  }
  return out;
}

function setF(name,val){
  const el=document.querySelector('[data-field="'+name+'"]');
  if(el)el.textContent=val==null?"":String(val);
}

function apply(data){
  const d=data||{};
  let filled=0;

  EDITABLE.forEach(function(f){
    let v=d[f];
    if(f==="validUntil"&&(v==null||String(v).trim()===""))v=DEFAULTS.validUntil;
    if(f==="issueDate")v=kDate(normalizeDate(v));
    const s=v==null?"":String(v).trim();
    setF(f,s);
    if(s&&s!==DEFAULTS.validUntil)filled++;
  });

  const items=Array.isArray(d.items)?d.items.slice(0,MAX_ITEMS):[];
  const rows=Math.max(MIN_ROWS,items.length);
  const gross=!!d.taxIncluded;
  let supply=0,itemCount=0,html="";

  items.forEach(function(it,i){
    it=it||{};
    const name=String(it.name||"").trim();
    if(name)itemCount++;
    const qty=toInt(it.qty);
    let price=toInt(it.unitPrice);
    if(gross&&price)price=Math.round(price/1.1);
    const unit=String(it.unit||"").trim()||"개";
    const amt=qty*price;
    supply+=amt;
    html+="<tr>"
      +'<td class="c">'+(i+1)+"</td>"
      +'<td class="c">'+(esc(name)||"&nbsp;")+"</td>"
      +'<td class="c">'+(esc(it.spec)||"&nbsp;")+"</td>"
      +'<td class="c">'+(qty||"&nbsp;")+"</td>"
      +'<td class="c">'+esc(unit)+"</td>"
      +'<td class="r">'+(price?fmt(price):"")+"</td>"
      +'<td class="r">'+fmt(amt)+" 원</td>"
      +'<td class="l">'+(esc(it.note)||"&nbsp;")+"</td>"
      +"</tr>";
  });
  for(let i=items.length;i<rows;i++){
    html+="<tr>"
      +'<td class="c">'+(i+1)+"</td>"
      +"<td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td>"
      +'<td class="c">개</td>'
      +'<td class="r"></td>'
      +'<td class="r">0 원</td>'
      +"<td>&nbsp;</td>"
      +"</tr>";
  }
  document.getElementById("itemsBody").innerHTML=html;

  const vat=Math.round(supply*0.1);
  const total=supply+vat;
  setF("subtotal",fmt(supply)+" 원");
  setF("vat",fmt(vat)+" 원");
  setF("total",fmt(total)+" 원");
  setF("totalWon","₩"+fmt(total));
  setF("totalKor",total>0?numKor(total)+"원 정":"");

  return {filledCount:filled,items:itemCount};
}

function reset(){apply({});}

window.QuoteForm={apply:apply,reset:reset};
})();
