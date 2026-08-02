// ERP 客戶對帳單：僅彙整通用帳務與沖帳資料，不建立或修改發票。
function erpStatementDateInRange(date,from,to){
  const value=String(date||"").slice(0,10);
  return !!value&&(!from||value>=from)&&(!to||value<=to);
}
function erpStatementSources(){
  const ledgers=erpAccountingAllVisibleLedgers().filter(row=>row.direction==="receivable"&&row.status!=="void");
  const migrated=new Set(erpLedgerCache.filter(row=>row.legacySourceId).map(row=>row.legacySourceId));
  const settlements=erpSettlementsCache.filter(row=>row.status!=="void"&&(row.settlementType==="receipt"||row.settlementType==="return_credit"||row.direction==="in"||row.direction==="credit")).map(row=>({...row,legacy:false}));
  const legacy=erpReceiptsCache.filter(row=>{
    const allocation=Array.isArray(row.allocations)?row.allocations[0]:null;
    return !row.voided&&!(allocation&&migrated.has(allocation.receivableId));
  }).map(row=>({
    id:"legacy:"+row.id,legacy:true,status:"active",
    settlementDate:row.receiptDate||"",settlementNo:row.receiptNo||"舊版收款",
    partyName:row.customerName||"",amount:erpAccountingNumber(row.amount),
    method:row.method||"",referenceNo:row.referenceNo||""
  }));
  return {ledgers,settlements:settlements.concat(legacy)};
}
function erpStatementPartyNames(){
  const source=erpStatementSources();
  return [...new Set(source.ledgers.map(row=>row.partyName).concat(source.settlements.map(row=>row.partyName)).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"zh-Hant"));
}
function erpStatementData(filter){
  const source=erpStatementSources(),party=filter.partyName||"";
  const ledger=source.ledgers.filter(row=>row.partyName===party);
  const settlements=source.settlements.filter(row=>row.partyName===party);
  const before=value=>filter.from&&String(value||"").slice(0,10)<filter.from;
  const opening=ledger.filter(row=>before(row.documentDate)).reduce((sum,row)=>sum+erpAccountingNumber(row.originalAmount),0)
    - settlements.filter(row=>before(row.settlementDate)).reduce((sum,row)=>sum+erpAccountingNumber(row.amount),0);
  const charges=ledger.filter(row=>erpStatementDateInRange(row.documentDate,filter.from,filter.to)).map(row=>({
    date:row.documentDate,kind:"應收",documentNo:row.sourceDocumentNo||row.ledgerNo,description:row.notes||"月結發票",debit:erpAccountingNumber(row.originalAmount),credit:0
  }));
  const credits=settlements.filter(row=>erpStatementDateInRange(row.settlementDate,filter.from,filter.to)).map(row=>({
    date:row.settlementDate,kind:row.settlementType==="return_credit"?"退回／折讓":"收款",documentNo:row.settlementNo||"-",description:(row.method||"")+" "+(row.referenceNo||""),debit:0,credit:erpAccountingNumber(row.amount)
  }));
  const rows=charges.concat(credits).sort((a,b)=>(a.date||"").localeCompare(b.date||"")||(a.kind==="應收"?-1:1));
  let balance=opening;
  rows.forEach(row=>{balance+=row.debit-row.credit;row.balance=balance;});
  return {opening:Math.max(0,opening),rows,chargeTotal:charges.reduce((sum,row)=>sum+row.debit,0),creditTotal:credits.reduce((sum,row)=>sum+row.credit,0),ending:Math.max(0,balance)};
}
function renderErpStatements(){
  const el=document.getElementById("erp-page-statements");
  if(!el) return;
  if(!erpStatementFilter.from){
    const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);
    erpStatementFilter.from=first.toISOString().slice(0,10);
    erpStatementFilter.to=todayStr();
  }
  const parties=erpStatementPartyNames();
  const data=erpStatementFilter.partyName?erpStatementData(erpStatementFilter):null;
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">CUSTOMER STATEMENT</p><h1>客戶對帳單</h1><p>對帳單只從應收帳與收款沖帳彙整，不會建立、修改或作廢任何發票。</p></div></div>'
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">STATEMENT FILTER</p><h2>選擇客戶與期間</h2></div></div>'
    + '<div class="erp-invoice-filters"><label>客戶<select id="erpStatementParty"><option value="">請選擇客戶</option>'+parties.map(name=>'<option value="'+erpEscape(name)+'"'+(erpStatementFilter.partyName===name?" selected":"")+'> '+erpEscape(name)+'</option>').join("")+'</select></label>'
    + '<label>帳務日期起<input type="date" id="erpStatementFrom" value="'+erpEscape(erpStatementFilter.from||"")+'"></label>'
    + '<label>帳務日期迄<input type="date" id="erpStatementTo" value="'+erpEscape(erpStatementFilter.to||"")+'"></label>'
    + '<button class="erp-secondary" id="erpStatementFilterBtn">產生對帳單</button></div></section>'
    + (data?'<section class="erp-panel" id="erpStatementPaper"><div class="erp-panel-title"><div><p class="erp-kicker">STATEMENT PREVIEW</p><h2>'+erpEscape(erpStatementFilter.partyName)+' 對帳單</h2><p>'+erpEscape(erpStatementFilter.from)+' ～ '+erpEscape(erpStatementFilter.to)+'</p></div><button class="erp-print-btn" id="erpStatementPrintBtn">列印預覽</button></div>'
      + '<div class="erp-metric-grid"><article class="erp-metric"><span>期初餘額</span><strong>NT$ '+erpMoney(data.opening)+'</strong></article><article class="erp-metric"><span>本期應收</span><strong>NT$ '+erpMoney(data.chargeTotal)+'</strong></article><article class="erp-metric"><span>本期收款</span><strong>NT$ '+erpMoney(data.creditTotal)+'</strong></article><article class="erp-metric"><span>期末未收</span><strong>NT$ '+erpMoney(data.ending)+'</strong></article></div>'
      + (data.rows.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>日期</th><th>類別</th><th>單據號碼</th><th>說明</th><th>應收</th><th>收款</th><th>餘額</th></tr></thead><tbody>'
        +data.rows.map(row=>'<tr><td>'+erpEscape(row.date||"-")+'</td><td>'+erpEscape(row.kind)+'</td><td><strong>'+erpEscape(row.documentNo)+'</strong></td><td>'+erpEscape(row.description||"-")+'</td><td>'+(row.debit?"NT$ "+erpMoney(row.debit):"-")+'</td><td>'+(row.credit?"NT$ "+erpMoney(row.credit):"-")+'</td><td><strong>NT$ '+erpMoney(row.balance)+'</strong></td></tr>').join("")
        +'</tbody></table></div>':'<div class="erp-empty">此期間沒有應收或收款異動。</div>')
      + '</section>':'<div class="erp-empty"><strong>請選擇客戶。</strong><br>系統會依帳務與沖帳歷程產生對帳單，不與發票共用操作流程。</div>');
  document.getElementById("erpStatementFilterBtn").addEventListener("click",()=>{
    erpStatementFilter={partyName:document.getElementById("erpStatementParty").value,from:document.getElementById("erpStatementFrom").value,to:document.getElementById("erpStatementTo").value};
    renderErpStatements();
  });
  const print=document.getElementById("erpStatementPrintBtn");
  if(print) print.addEventListener("click",()=>window.print());
}
