// ERP 帳務清單：應收／應付帳、歷史資料轉入與收款沖帳入口。
function erpLedgerMetric(entries,key){
  return entries.reduce((sum,row)=>sum+erpAccountingNumber(row[key]),0);
}
function erpSettlementHistory(){
  const current=erpSettlementsCache.map(row=>({...row,legacy:false}));
  const legacy=erpReceiptsCache.map(row=>({
    id:"legacy:"+row.id,legacy:true,
    settlementDate:row.receiptDate||"",
    settlementNo:row.receiptNo||"舊版收款",
    partyName:row.customerName||"",
    amount:erpAccountingNumber(row.amount),
    method:row.method||"",
    referenceNo:row.referenceNo||"",
    status:row.voided?"void":"active"
  }));
  return current.concat(legacy).sort((a,b)=>{
    const av=(a.settlementDate||"")+" "+(a.settlementNo||"");
    const bv=(b.settlementDate||"")+" "+(b.settlementNo||"");
    return bv.localeCompare(av,"zh-Hant");
  });
}
function renderErpAccounting(){
  const el=document.getElementById("erp-page-accounting");
  if(!el) return;
  const all=erpAccountingAllVisibleLedgers();
  const open=all.filter(row=>row.status!=="void"&&erpAccountingNumber(row.balanceAmount)>0);
  const newOpen=open.filter(row=>!row.legacy);
  const settlements=erpSettlementHistory();
  const openAmount=erpLedgerMetric(open,"balanceAmount");
  const settledAmount=erpLedgerMetric(erpLedgerCache,"settledAmount");
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">ACCOUNTING FOUNDATION</p><h1>帳務與收款</h1><p>新帳務採通用帳、沖帳與票據三層資料結構；舊版應收／收款資料會保留，可逐筆安全轉入。</p></div></div>'
    + '<div class="erp-metric-grid">'
    + '<article class="erp-metric"><span>未結帳務</span><strong>NT$ '+erpMoney(openAmount)+'</strong><small>'+open.length+' 筆應收／應付</small></article>'
    + '<article class="erp-metric"><span>新帳務已沖帳</span><strong>NT$ '+erpMoney(settledAmount)+'</strong><small>只計入通用帳務層</small></article>'
    + '<article class="erp-metric"><span>有效收款紀錄</span><strong>'+settlements.filter(x=>x.status!=="void").length+'</strong><small>可修改、可作廢且保留歷程</small></article>'
    + '</div>'
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">OPEN LEDGER</p><h2>未結帳務</h2></div><span class="erp-counter">'+open.length+' 筆</span></div>'
    + (open.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>類別</th><th>帳務單號</th><th>往來對象</th><th>單據日期</th><th>原始金額</th><th>已沖帳</th><th>餘額</th><th>狀態</th><th>操作</th></tr></thead><tbody>'
      + open.map(row=>'<tr><td>'+erpAccountingDirectionLabel(row.direction)+'</td><td><strong>'+erpEscape(row.ledgerNo||"-")+'</strong></td><td>'+erpEscape(row.partyName||"-")+'</td><td>'+erpEscape(row.documentDate||"-")+'</td><td>NT$ '+erpMoney(row.originalAmount)+'</td><td>NT$ '+erpMoney(row.settledAmount)+'</td><td><strong>NT$ '+erpMoney(row.balanceAmount)+'</strong></td><td>'+erpEscape(erpAccountingStatusLabel(row.status))+'</td><td>'
        + (row.legacy?'<button class="erp-secondary" data-erp-migrate-ledger="'+erpEscape(row.legacyReceivableId)+'">轉入新帳務</button>':'<button class="erp-primary" data-erp-settle-ledger="'+erpEscape(row.id)+'">登錄收款</button>')
        + '</td></tr>').join("")
      + '</tbody></table></div>':'<div class="erp-empty">目前沒有未結帳務。下一批「月結開票」建立的應收會直接進入此處。</div>')
    + '</section>'
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">SETTLEMENT HISTORY</p><h2>收款沖帳歷程</h2></div><span class="erp-counter">'+settlements.length+' 筆</span></div>'
    + (settlements.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>日期</th><th>沖帳單號</th><th>往來對象</th><th>方式</th><th>參考資料</th><th>金額</th><th>狀態</th><th>操作</th></tr></thead><tbody>'
      + settlements.map(row=>'<tr><td>'+erpEscape(row.settlementDate||"-")+'</td><td><strong>'+erpEscape(row.settlementNo||"-")+'</strong></td><td>'+erpEscape(row.partyName||"-")+'</td><td>'+erpEscape(row.method||"-")+'</td><td>'+erpEscape(row.referenceNo||"-")+'</td><td>NT$ '+erpMoney(row.amount)+'</td><td>'+erpEscape(row.status==="void"?"已作廢":row.legacy?"舊版保留":"有效")+'</td><td>'
        + (!row.legacy&&row.status!=="void"&&row.settlementType==="receipt"?'<button class="erp-edit-btn" data-erp-edit-settlement="'+erpEscape(row.id)+'">修改</button><button class="erp-edit-btn" data-erp-void-settlement="'+erpEscape(row.id)+'">作廢</button>':'')
        + '</td></tr>').join("")
      + '</tbody></table></div>':'<div class="erp-empty">尚無收款沖帳紀錄。</div>')
    + '</section>';
  el.querySelectorAll("[data-erp-migrate-ledger]").forEach(button=>button.addEventListener("click",async()=>{
    if(!confirm("轉入後會建立新帳務資料，但不會刪除或修改舊版應收。是否繼續？")) return;
    try{
      await erpAccountingMigrateLegacyReceivable(button.dataset.erpMigrateLedger);
      alert("已轉入通用帳務層。");
    }catch(error){
      console.error(error);
      alert("轉入失敗："+(error.message||"請確認 Firebase Rules 權限。"));
    }
  }));
  el.querySelectorAll("[data-erp-settle-ledger]").forEach(button=>button.addEventListener("click",()=>openErpSettlementForm(button.dataset.erpSettleLedger)));
  el.querySelectorAll("[data-erp-edit-settlement]").forEach(button=>button.addEventListener("click",()=>{
    const item=erpSettlementById(button.dataset.erpEditSettlement);
    const ledgerId=erpSettlementLedgerId(item);
    if(ledgerId) openErpSettlementForm(ledgerId,item.id);
  }));
  el.querySelectorAll("[data-erp-void-settlement]").forEach(button=>button.addEventListener("click",()=>voidErpSettlement(button.dataset.erpVoidSettlement)));
}
