// ERP 發票字軌管理：字軌與號碼範圍獨立保存，發票開立時由 Firestore transaction 取下一號。
function erpInvoiceSeriesNumber(value){
  const n=Number(value);
  return Number.isInteger(n)&&n>=0?n:0;
}
function normalizeInvoiceSeriesCode(value){
  return String(value||"").trim().toUpperCase().replace(/[^A-Z]/g,"").slice(0,2);
}
function erpInvoiceSeriesLabel(series){
  if(!series) return "未選擇字軌";
  return (series.seriesCode||"")+"｜"+(series.periodLabel||"未標示期別")+"｜下一號 "+String(erpInvoiceSeriesNumber(series.nextNumber)).padStart(8,"0");
}
function erpInvoiceSeriesFormat(code,number){
  return normalizeInvoiceSeriesCode(code)+"-"+String(erpInvoiceSeriesNumber(number)).padStart(8,"0");
}
function erpActiveInvoiceSeries(){
  return erpInvoiceSeriesCache.filter(series=>series.active!==false)
    .sort((a,b)=>((a.periodLabel||"")+" "+(a.seriesCode||"")).localeCompare((b.periodLabel||"")+" "+(b.seriesCode||""),"zh-Hant"));
}
function erpInvoiceSeriesOptions(selectedId){
  const active=erpActiveInvoiceSeries();
  return '<option value="">請選擇已設定字軌</option>'
    + active.map(series=>'<option value="'+erpEscape(series.id)+'"'+(series.id===selectedId?" selected":"")+'>'
      +erpEscape(erpInvoiceSeriesLabel(series))+'</option>').join("");
}
function erpInvoiceSeriesById(id){
  return erpInvoiceSeriesCache.find(series=>series.id===id);
}
function erpReserveInvoiceNumber(tx,seriesId){
  const seriesRef=db.collection("erpInvoiceSeries").doc(seriesId);
  return tx.get(seriesRef).then(snapshot=>{
    if(!snapshot.exists) throw new Error("找不到發票字軌，請重新整理後再試。");
    const series=snapshot.data();
    if(series.active===false) throw new Error("此發票字軌已停用，請選擇其他字軌。");
    const code=normalizeInvoiceSeriesCode(series.seriesCode);
    const next=erpInvoiceSeriesNumber(series.nextNumber);
    const end=erpInvoiceSeriesNumber(series.endNumber);
    if(code.length!==2) throw new Error("發票字軌必須是兩個英文字母。");
    if(next<=0||end<=0||next>end) throw new Error("發票字軌已用完或號碼範圍設定不正確。");
    tx.update(seriesRef,{nextNumber:next+1,lastIssuedNumber:next,lastIssuedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name});
    return {seriesId:seriesRef.id,seriesCode:code,periodLabel:series.periodLabel||"",sequenceNo:next,invoiceNo:erpInvoiceSeriesFormat(code,next)};
  });
}
function openErpInvoiceSeriesManager(){
  const old=document.getElementById("erpInvoiceSeriesOverlay");
  if(old) old.remove();
  const rows=erpInvoiceSeriesCache.slice().sort((a,b)=>((b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0)-(a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0)));
  const box=document.createElement("div");
  box.id="erpInvoiceSeriesOverlay";
  box.className="erp-print-overlay";
  box.innerHTML='<div class="erp-print-paper erp-receipt-form">'
    + '<h2>發票字軌管理</h2><p>請依實際取得的發票字軌與可用號碼範圍設定。系統開票後只會往下一號，不會因作廢而回收號碼。</p>'
    + '<form id="erpInvoiceSeriesForm" class="erp-form">'
    + '<div class="erp-form-row"><label>字軌（兩碼英文字）<input name="code" maxlength="2" placeholder="例如 AB" required></label><label>適用期別<input name="period" placeholder="例如 115年07-08月" required></label></div>'
    + '<div class="erp-form-row"><label>起始號碼<input name="start" type="number" min="1" max="99999999" placeholder="例如 1" required></label><label>結束號碼<input name="end" type="number" min="1" max="99999999" placeholder="例如 99999999" required></label></div>'
    + '<div class="erp-form-actions"><button type="button" class="erp-secondary" id="closeInvoiceSeries">關閉</button><button class="erp-primary">新增字軌</button></div></form>'
    + '<section class="erp-mini-list"><h3>目前字軌</h3>'
    + (rows.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>字軌</th><th>期別</th><th>下一號</th><th>結束號</th><th>狀態</th><th></th></tr></thead><tbody>'
      +rows.map(series=>'<tr><td><strong>'+erpEscape(series.seriesCode)+'</strong></td><td>'+erpEscape(series.periodLabel||"-")+'</td><td>'+String(erpInvoiceSeriesNumber(series.nextNumber)).padStart(8,"0")+'</td><td>'+String(erpInvoiceSeriesNumber(series.endNumber)).padStart(8,"0")+'</td><td>'+erpEscape(series.active===false?"停用":"啟用")+'</td><td>'+(series.active===false?"":'<button class="erp-edit-btn" data-erp-series-disable="'+erpEscape(series.id)+'">停用</button>')+'</td></tr>').join("")
      +'</tbody></table></div>':'<div class="erp-empty">尚未設定發票字軌。</div>')
    + '</section></div>';
  document.body.appendChild(box);
  document.getElementById("closeInvoiceSeries").onclick=()=>box.remove();
  document.getElementById("erpInvoiceSeriesForm").onsubmit=event=>{
    event.preventDefault();
    saveErpInvoiceSeries(event.currentTarget,box);
  };
  box.querySelectorAll("[data-erp-series-disable]").forEach(button=>button.addEventListener("click",()=>disableErpInvoiceSeries(button.dataset.erpSeriesDisable)));
}
async function saveErpInvoiceSeries(form,box){
  const code=normalizeInvoiceSeriesCode(form.elements.code.value);
  const period=(form.elements.period.value||"").trim();
  const start=erpInvoiceSeriesNumber(form.elements.start.value);
  const end=erpInvoiceSeriesNumber(form.elements.end.value);
  if(code.length!==2) return alert("發票字軌必須是兩個英文字母，例如 AB。");
  if(!period) return alert("請填寫適用期別。");
  if(start<=0||end<=0||start>end) return alert("請確認起始與結束號碼。");
  const id=code+"_"+period.replace(/[^A-Za-z0-9\u4e00-\u9fff]/g,"").slice(0,30);
  try{
    await db.runTransaction(async tx=>{
      const ref=db.collection("erpInvoiceSeries").doc(id);
      const existing=await tx.get(ref);
      if(existing.exists) throw new Error("此字軌與期別已建立，請勿重複新增。");
      tx.set(ref,{seriesCode:code,periodLabel:period,startNumber:start,nextNumber:start,endNumber:end,active:true,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
    });
    box.remove();
    erpAccountingAudit("invoice_series_created",id,{seriesCode:code,periodLabel:period,startNumber:start,endNumber:end});
  }catch(error){
    console.error(error);
    alert("新增失敗："+(error.message||"請確認 Firebase Rules 權限。"));
  }
}
async function disableErpInvoiceSeries(id){
  const item=erpInvoiceSeriesById(id);
  if(!item||item.active===false) return;
  if(!confirm("停用字軌「"+item.seriesCode+"」？已開立發票不受影響。")) return;
  try{
    await db.collection("erpInvoiceSeries").doc(id).update({active:false,disabledAt:firebase.firestore.FieldValue.serverTimestamp(),disabledByUid:currentUser.uid,disabledByName:currentUser.name});
    erpAccountingAudit("invoice_series_disabled",id,{seriesCode:item.seriesCode});
    const overlay=document.getElementById("erpInvoiceSeriesOverlay");
    if(overlay) overlay.remove();
  }catch(error){
    console.error(error);
    alert("停用失敗："+(error.message||""));
  }
}
