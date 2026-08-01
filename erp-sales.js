// ERP 銷貨單、多品項明細與庫存銷貨帶入
// 舊資料相容：沒有 lines 的舊銷貨單會自動視為一個品項。
function erpTaxLabel(mode){ return ({no_tax:"不計稅",tax_included:"含稅",tax_excluded:"未稅外加"}[mode] || "不計稅"); }
function erpCustomerParties(){ return erpPartiesCache.filter(p => (p.type || "customer") === "customer"); }

async function confirmErpSalesOrder(id){
  if(!confirm("確認這張銷貨單？\n目前只改變狀態，不會扣庫存或建立帳款。")) return;
  try{
    await db.collection("erpSalesOrders").doc(id).update({
      status:"confirmed", confirmedAt:firebase.firestore.FieldValue.serverTimestamp(),
      confirmedByUid:currentUser.uid, confirmedByName:currentUser.name
    });
  }catch(err){
    console.error(err); alert("確認失敗，請稍後再試。");
  }
}


// ------------------------------------------------------------
// 待轉銷貨：輪胎與 KYB 的既有「銷貨」只帶入 ERP，不修改來源、不再次扣庫存。
// ------------------------------------------------------------
function erpSourceItemLabel(sourceType, transaction){
  if(sourceType === "tire"){
    const item = erpTireItemsCache.find(i => i.id === transaction.itemId);
    return item ? [item.brand,item.spec,item.model ? "（" + item.model + "）" : ""].filter(Boolean).join(" ") : (transaction.itemLabel || "輪胎品項（主檔已刪除）");
  }
  const item = erpKybItemsCache.find(i => i.id === transaction.itemId);
  return item ? (item.carModel || item.itemLabel || "KYB 車型") + "（KYB）" : (transaction.itemLabel || "KYB 品項（主檔已刪除）");
}
function erpSalesSources(){
  const make = (sourceType, list) => list.filter(t => t.type === "out").map(t => ({
    key:sourceType + ":" + t.id, sourceType, sourceTransactionId:t.id,
    date:t.date || "", quantity:Number(t.qty)||0, customerName:t.customerName || "",
    customerContact:t.customerContact || "", notes:t.customerNote || "",
    salesperson:t.salesperson || t.operator || "", itemName:erpSourceItemLabel(sourceType,t)
  }));
  return [...make("tire",erpTireTransactionsCache),...make("kyb",erpKybTransactionsCache)]
    .sort((a,b) => (b.date || "").localeCompare(a.date || ""));
}
function renderErpTransfers(){
  const el = document.getElementById("erp-page-transfers");
  if(!el) return;
  const sources = erpSalesSources();
  const linked = new Map(erpSalesOrdersCache.filter(o => o.sourceTransactionId).map(o => [o.sourceType + ":" + o.sourceTransactionId,o]));
  const outstanding = sources.filter(s => !linked.has(s.key));
  el.innerHTML = `
    <div class="erp-page-heading"><div><p class="erp-kicker">IMPORT FROM INVENTORY SALES</p><h1>待建立銷貨單</h1><p>所有輪胎與 KYB 銷貨都集中在此。帶入後只補帳務資料，不影響既有庫存。</p></div></div>
    <div class="erp-transfer-summary"><article><strong>${sources.length}</strong><span>全部來源銷貨</span></article><article><strong>${outstanding.length}</strong><span>尚未帶入 ERP</span></article><article><strong>${sources.length-outstanding.length}</strong><span>已建立 ERP 銷貨單</span></article></div>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">UNLINKED SALES</p><h2>尚未帶入的銷貨</h2></div><span class="erp-counter">${outstanding.length} 筆</span></div>
      ${outstanding.length ? '<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>日期</th><th>來源</th><th>品項</th><th>數量</th><th>客戶</th><th>業務</th><th></th></tr></thead><tbody>' + outstanding.map(s => '<tr><td>' + erpEscape(s.date || "-") + '</td><td><span class="erp-source-tag ' + s.sourceType + '">' + (s.sourceType === "tire" ? "輪胎" : "KYB") + '</span></td><td><strong>' + erpEscape(s.itemName) + '</strong></td><td>' + s.quantity + '</td><td>' + erpEscape(s.customerName || "未填寫") + '</td><td>' + erpEscape(s.salesperson || "-") + '</td><td><button class="erp-primary erp-transfer-btn" data-erp-transfer="' + erpEscape(s.key) + '">帶入銷貨單資訊</button></td></tr>').join("") + '</tbody></table></div>' : '<div class="erp-empty"><strong>目前沒有待轉銷貨。</strong><br>新建立的輪胎或 KYB 銷貨會自動出現在這裡。</div>'}
    </section>
    <section class="erp-panel erp-linked-panel"><div class="erp-panel-title"><div><p class="erp-kicker">LINKED SALES</p><h2>已帶入紀錄</h2></div></div>
      ${linked.size ? '<div class="erp-list">' + sources.filter(s => linked.has(s.key)).map(s => { const o=linked.get(s.key); return '<article class="erp-list-row"><div class="erp-avatar">' + (s.sourceType === "tire" ? "輪" : "K") + '</div><div><strong>' + erpEscape(s.itemName) + '</strong><p>' + erpEscape(o.orderNo) + " · " + erpEscape(s.date) + " · " + erpStatus(o.status) + '</p></div><button class="erp-edit-btn" data-erp-edit-linked="' + erpEscape(o.id) + '">帶入銷貨單資訊</button></article>'; }).join("") + '</div>' : '<div class="erp-empty">尚無已帶入紀錄。</div>'}
    </section>`;
  el.querySelectorAll("[data-erp-transfer]").forEach(btn => btn.addEventListener("click", () => {
    const source = sources.find(s => s.key === btn.dataset.erpTransfer);
    if(source) importErpSourceSale(source);
  }));
  el.querySelectorAll("[data-erp-edit-linked]").forEach(btn => btn.addEventListener("click", () => {
    erpSalesEditingId = btn.dataset.erpEditLinked; showErpView("sales"); window.scrollTo({top:0,behavior:"smooth"});
  }));
}
async function importErpSourceSale(source){
  const existing = erpSalesOrdersCache.find(o => o.sourceType === source.sourceType && o.sourceTransactionId === source.sourceTransactionId);
  if(existing){ erpSalesEditingId=existing.id; showErpView("sales"); return; }
  if(!confirm("帶入這筆" + (source.sourceType === "tire" ? "輪胎" : "KYB") + "銷貨？\n來源庫存不會被修改，也不會再次扣庫存。")) return;
  const customer = erpCustomerParties().find(c => (c.name || "").trim() === source.customerName.trim());
  try{
    await db.collection("erpSalesOrders").add({
      orderNo:erpOrderNumber(), orderDate:source.date || todayStr(),
      customerId:customer ? customer.id : null, customerCode:customer ? (customer.partyCode || "") : "", customerName:source.customerName || "",
      taxMode:"no_tax", salesperson:source.salesperson, itemSource:source.sourceType,
      itemName:source.itemName, quantity:source.quantity, unitPrice:0, amount:0,
      notes:source.notes || "", status:"draft", sourceType:source.sourceType,
      sourceTransactionId:source.sourceTransactionId, sourceCustomerContact:source.customerContact || "",
      createdAt:firebase.firestore.FieldValue.serverTimestamp(), createdByUid:currentUser.uid, createdByName:currentUser.name
    });
  }catch(err){
    console.error(err); alert("帶入失敗，請稍後再試。");
  }
}



// ============================================================
// 月結開票與銷貨單預覽列印
// ============================================================

function erpOrderLines(o){
  if(Array.isArray(o.lines)&&o.lines.length)return o.lines;
  return [{itemSource:o.itemSource||"custom",itemName:o.itemName||"",quantity:Number(o.quantity)||0,unitPrice:Number(o.unitPrice)||0}];
}
function erpCalcLines(lines,mode){
  const lineAmount=lines.reduce((s,l)=>s+(Number(l.quantity)||0)*(Number(l.unitPrice)||0),0);
  return erpTotals({lineAmount,taxMode:mode||"no_tax"});
}
function erpTotals(source){
  const lineAmount=source.lines?source.lines.reduce((s,l)=>s+(Number(l.quantity)||0)*(Number(l.unitPrice)||0),0):
    (source.lineAmount!=null?Number(source.lineAmount):((Number(source.quantity)||0)*(Number(source.unitPrice)||0)));
  if(source.taxMode==="tax_excluded"){const subtotal=Math.round(lineAmount),taxAmount=Math.round(subtotal*.05);return{lineAmount:subtotal,subtotal,taxAmount,totalAmount:subtotal+taxAmount,taxRate:.05};}
  if(source.taxMode==="tax_included"){const totalAmount=Math.round(lineAmount),subtotal=Math.round(totalAmount/1.05);return{lineAmount:totalAmount,subtotal,taxAmount:totalAmount-subtotal,totalAmount,taxRate:.05};}
  const subtotal=Math.round(lineAmount);return{lineAmount:subtotal,subtotal,taxAmount:0,totalAmount:subtotal,taxRate:0};
}
function erpDisplayTotals(o){return o&&o.totalAmount!=null?{subtotal:Number(o.subtotalAmount)||0,taxAmount:Number(o.taxAmount)||0,totalAmount:Number(o.totalAmount)||0}:erpTotals(o||{});}
function erpLineSummary(o){const a=erpOrderLines(o);return erpEscape(a[0].itemName||"-")+(a.length>1?" 等 "+a.length+" 項":"")+" × "+(Number(a[0].quantity)||0);}
function erpLineRow(line={},i=0){return '<div class="erp-line-row" data-line="'+i+'"><select class="line-source"><option value="tire"'+(line.itemSource==="tire"?" selected":"")+'>輪胎</option><option value="kyb"'+(line.itemSource==="kyb"?" selected":"")+'>KYB</option><option value="custom"'+(line.itemSource==="custom"?" selected":"")+'>其他</option></select><input class="line-name" value="'+erpEscape(line.itemName||"")+'" placeholder="品項名稱"><input class="line-qty" type="number" min="1" value="'+(Number(line.quantity)||1)+'"><input class="line-price" type="number" min="0" value="'+(Number(line.unitPrice)||0)+'"><strong class="line-total">0</strong><button type="button" class="erp-line-remove" title="移除">×</button></div>';}
function renderErpSales(){
  const el=document.getElementById("erp-page-sales");
  if(!el)return;
  const o=erpSalesEditingId?erpSalesOrdersCache.find(x=>x.id===erpSalesEditingId):null;
  const isSource=!!(o&&o.sourceTransactionId);
  const editable=!!(o&&isSource&&o.status!=="confirmed");
  const customers=erpCustomerParties().map(c=>'<option value="'+erpEscape(c.id)+'"'+(o&&o.customerId===c.id?" selected":"")+">"+erpEscape((c.partyCode ? c.partyCode+"｜" : "")+c.name)+"</option>").join("");
  const val=(k,f="")=>erpEscape(o&&o[k]!=null?o[k]:f);
  const sel=(k,x)=>o&&o[k]===x?" selected":"";
  const line=o?erpOrderLines(o)[0]:null;
  let formHtml='';
  if(!o){
    formHtml='<div class="erp-empty"><strong>銷貨單只能由庫存銷貨帶入。</strong><br>請前往「待建立銷貨單」，選擇一筆輪胎或 KYB 銷貨後帶入，再補齊帳務資訊。</div>';
  }else if(!isSource){
    formHtml='<div class="erp-empty"><strong>這是舊版手動建立的草稿。</strong><br>為避免造成庫存與帳務來源不一致，無法再編輯。若不需要，僅可在下方清單刪除草稿。</div>';
  }else if(!editable){
    formHtml='<div class="erp-confirmed-note">此銷貨單已確認，可列印並納入月結發票。</div>';
  }else{
    formHtml='<form id="erpSalesForm" class="erp-form">'
      +'<div class="erp-form-row"><label>銷貨單號<input name="orderNo" value="'+val("orderNo")+'" readonly></label><label>銷貨日期<input name="orderDate" type="date" value="'+val("orderDate")+'" readonly></label></div>'
      +'<div class="erp-form-row"><label>已建檔客戶<select name="customerId"><option value="">尚未選擇</option>'+customers+'</select></label><label>客戶名稱 <b>*</b><input name="customerName" value="'+val("customerName")+'" required></label></div>'
      +'<div class="erp-form-row"><label>稅別<select name="taxMode"><option value="no_tax"'+sel("taxMode","no_tax")+'>不計稅</option><option value="tax_included"'+sel("taxMode","tax_included")+'>含稅</option><option value="tax_excluded"'+sel("taxMode","tax_excluded")+'>未稅外加（5%）</option></select></label><label>業務／經手人<input name="salesperson" value="'+val("salesperson",currentUser?currentUser.name:"")+'"></label></div>'
      +'<div class="erp-line-box"><p>庫存銷貨明細（不可修改）</p><div class="erp-line-head"><span>來源</span><span>品項名稱</span><span>數量</span><span>單價</span><span>小計</span></div>'
      +'<div class="erp-line-row"><span><span class="erp-source-tag '+erpEscape(o.sourceType||line.itemSource||"custom")+'">'+erpEscape((o.sourceType||line.itemSource)==="tire"?"輪胎":(o.sourceType||line.itemSource)==="kyb"?"KYB":"庫存")+'</span></span><strong>'+erpEscape(line.itemName)+'</strong><span>'+erpEscape(String(line.quantity))+'</span><input class="line-price" name="unitPrice" type="number" min="0" step="1" value="'+erpEscape(String(Number(line.unitPrice)||0))+'" required><strong>NT$ <span id="erpLineTotal">0</span></strong></div></div>'
      +'<div class="erp-tax-summary"><div><span>未稅金額</span><strong id="erpSubtotalText">NT$ 0</strong></div><div><span>營業稅 <em id="erpTaxRateText">0%</em></span><strong id="erpTaxText">NT$ 0</strong></div><div class="erp-grand-total"><span>含稅總計</span><strong id="erpTotalText">NT$ 0</strong></div></div>'
      +'<label>備註<textarea name="notes" rows="2">'+val("notes")+'</textarea></label><div class="erp-form-actions"><button class="erp-secondary" type="button" id="erpCancelEditBtn">返回清單</button><button class="erp-secondary" type="button" id="erpSaveDraftBtn">儲存帳務資訊</button><button class="erp-primary" type="submit">送出待確認</button></div></form>';
  }
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">SALES DOCUMENTS</p><h1>銷貨單</h1><p>銷貨必須先在庫存系統完成，再於此帶入與補登帳務資訊；不會從 ERP 直接扣庫存。</p></div></div>'
    +'<section class="erp-panel erp-form-panel">'+formHtml+'</section>'
    +'<section class="erp-panel"><div class="erp-panel-title"><h2>銷貨單清單</h2><span class="erp-counter">'+erpSalesOrdersCache.length+' 筆</span></div>'
    +(erpSalesOrdersCache.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>單號</th><th>客戶</th><th>品項</th><th>未稅</th><th>稅額</th><th>總計</th><th>狀態</th><th>操作</th></tr></thead><tbody>'+erpSalesOrdersCache.map(x=>{const t=erpDisplayTotals(x),source=!!x.sourceTransactionId;let actions='';if(x.status==="confirmed"){actions='<button class="erp-print-btn" data-print="'+x.id+'">預覽列印</button>';}else if(source){actions='<button class="erp-edit-btn" data-edit="'+x.id+'">帶入銷貨單資訊</button>'+(x.status==="draft"?'<button class="erp-edit-btn" data-delete="'+x.id+'">刪除</button>':'')+(x.status==="submitted"?'<button class="erp-confirm-btn" data-confirm="'+x.id+'">確認</button>':'');}else{actions=x.status==="draft"?'<button class="erp-edit-btn" data-delete="'+x.id+'">刪除舊草稿</button>':'<span class="erp-muted">舊版資料</span>';}return '<tr><td><strong>'+erpEscape(x.orderNo)+'</strong></td><td>'+erpEscape(x.customerName)+'</td><td>'+erpLineSummary(x)+'</td><td>NT$ '+erpMoney(t.subtotal)+'</td><td>NT$ '+erpMoney(t.taxAmount)+'</td><td><strong>NT$ '+erpMoney(t.totalAmount)+'</strong></td><td>'+erpStatus(x.status)+(x.invoiceId?'<br><span class="erp-invoiced-tag">已月結</span>':'')+'</td><td>'+actions+'</td></tr>';}).join("")+'</tbody></table></div>':'<div class="erp-empty">尚無銷貨單。</div>')+'</section>';
  const bindListActions=()=>{
    el.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>{erpSalesEditingId=b.dataset.edit;renderErpSales();}));
    el.querySelectorAll("[data-confirm]").forEach(b=>b.addEventListener("click",()=>confirmErpSalesOrder(b.dataset.confirm)));
    el.querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteErpDraft(b.dataset.delete)));
    el.querySelectorAll("[data-print]").forEach(b=>b.addEventListener("click",()=>openErpPrintPreview(erpSalesOrdersCache.find(x=>x.id===b.dataset.print))));
  };
  bindListActions();
  const form=document.getElementById("erpSalesForm");
  if(!form)return;
  const getLines=()=>[{itemSource:o.sourceType||line.itemSource||"custom",itemName:line.itemName,quantity:Number(line.quantity)||0,unitPrice:Number(form.elements.unitPrice.value)||0}];
  const refresh=()=>{const ls=getLines(),t=erpCalcLines(ls,form.elements.taxMode.value);document.getElementById("erpLineTotal").textContent=erpMoney(t.lineAmount);document.getElementById("erpSubtotalText").textContent="NT$ "+erpMoney(t.subtotal);document.getElementById("erpTaxText").textContent="NT$ "+erpMoney(t.taxAmount);document.getElementById("erpTotalText").textContent="NT$ "+erpMoney(t.totalAmount);document.getElementById("erpTaxRateText").textContent=t.taxRate?"5%":"0%";};
  form.addEventListener("input",refresh);
  form.elements.taxMode.addEventListener("change",refresh);
  form.elements.customerId.addEventListener("change",()=>{const c=erpCustomerParties().find(x=>x.id===form.elements.customerId.value);if(c)form.elements.customerName.value=c.name;});
  document.getElementById("erpCancelEditBtn").addEventListener("click",()=>{erpSalesEditingId=null;renderErpSales();});
  document.getElementById("erpSaveDraftBtn").addEventListener("click",()=>saveErpMulti(form,getLines,"draft"));
  form.addEventListener("submit",e=>{e.preventDefault();saveErpMulti(form,getLines,"submitted");});
  refresh();
}
async function saveErpMulti(form,getLines,status){if(!form.reportValidity())return;const lines=getLines();if(!lines.length)return alert("請至少填寫一個品項。");const t=erpCalcLines(lines,form.elements.taxMode.value),customer=erpCustomerParties().find(c=>c.id===form.elements.customerId.value),data={orderNo:form.elements.orderNo.value.trim(),orderDate:form.elements.orderDate.value,customerId:customer?customer.id:null,customerCode:customer?(customer.partyCode||""):"",customerName:form.elements.customerName.value.trim(),salesperson:form.elements.salesperson.value.trim(),taxMode:form.elements.taxMode.value,lines, itemSource:lines[0].itemSource,itemName:lines[0].itemName,quantity:lines[0].quantity,unitPrice:lines[0].unitPrice,lineAmount:t.lineAmount,amount:t.lineAmount,subtotalAmount:t.subtotal,taxAmount:t.taxAmount,totalAmount:t.totalAmount,taxRate:t.taxRate,notes:form.elements.notes.value.trim(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};try{if(erpSalesEditingId){await db.collection("erpSalesOrders").doc(erpSalesEditingId).update({...data,status});erpSalesEditingId=null;}else{await db.collection("erpSalesOrders").add({...data,status,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});form.reset();} }catch(e){console.error(e);alert("儲存失敗，請稍後再試。");}}

async function deleteErpDraft(id){const o=erpSalesOrdersCache.find(x=>x.id===id);if(!o||o.status!=="draft")return;if(!confirm("刪除此銷貨草稿？此操作僅限未送出的草稿。"))return;try{await db.collection("erpSalesOrders").doc(id).delete();logErpAudit("sales_draft_deleted",id,{orderNo:o.orderNo});}catch(e){console.error(e);alert("刪除失敗。");}}
