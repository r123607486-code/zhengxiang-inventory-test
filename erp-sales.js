// ERP 銷貨單、多品項明細與庫存銷貨帶入
function erpTotals(source){
  const qty = Number(source.quantity) || 0;
  const price = Number(source.unitPrice) || 0;
  const lineAmount = Number.isFinite(Number(source.lineAmount)) ? Number(source.lineAmount) :
    (Number.isFinite(Number(source.amount)) && Number(source.amount) !== 0 ? Number(source.amount) : qty * price);
  const mode = source.taxMode || "no_tax";
  if(mode === "tax_excluded"){
    const subtotal = Math.round(lineAmount);
    const tax = Math.round(subtotal * 0.05);
    return { lineAmount:subtotal, subtotal, taxAmount:tax, totalAmount:subtotal+tax, taxRate:0.05 };
  }
  if(mode === "tax_included"){
    const totalAmount = Math.round(lineAmount);
    const subtotal = Math.round(totalAmount / 1.05);
    return { lineAmount:totalAmount, subtotal, taxAmount:totalAmount-subtotal, totalAmount, taxRate:0.05 };
  }
  const subtotal = Math.round(lineAmount);
  return { lineAmount:subtotal, subtotal, taxAmount:0, totalAmount:subtotal, taxRate:0 };
}
function erpDisplayTotals(order){
  if(order && (order.subtotalAmount != null || order.totalAmount != null)){
    return { subtotal:Number(order.subtotalAmount)||0, taxAmount:Number(order.taxAmount)||0, totalAmount:Number(order.totalAmount != null ? order.totalAmount : order.amount)||0 };
  }
  return erpTotals(order || {});
}
function erpTaxLabel(mode){ return ({no_tax:"不計稅",tax_included:"含稅",tax_excluded:"未稅外加"}[mode] || "不計稅"); }
function renderErpSales(){
  const el = document.getElementById("erp-page-sales");
  if(!el) return;
  const editing = erpSalesEditingId ? erpSalesOrdersCache.find(o => o.id === erpSalesEditingId) : null;
  const customerOptions = erpCustomersCache.map(c => '<option value="' + erpEscape(c.id) + '"' + ((editing && editing.customerId === c.id) ? " selected" : "") + '>' + erpEscape(c.name) + '</option>').join("");
  const value = (field, fallback="") => erpEscape(editing && editing[field] != null ? editing[field] : fallback);
  const selected = (field, option, fallback) => ((editing && editing[field] === option) || (!editing && fallback === option)) ? " selected" : "";
  const canEdit = !editing || editing.status !== "confirmed";
  const actionButtons = !editing
    ? '<button class="erp-secondary" type="button" id="erpSaveDraftBtn">儲存草稿</button><button class="erp-primary" type="submit">送出待確認</button>'
    : '<button class="erp-secondary" type="button" id="erpCancelEditBtn">取消修改</button>' +
      (editing.status === "draft" ? '<button class="erp-secondary" type="button" id="erpSaveDraftBtn">儲存草稿</button><button class="erp-primary" type="button" id="erpSubmitSalesBtn">送出待確認</button>' : '<button class="erp-primary" type="submit">儲存修改</button>');
  el.innerHTML = `
    <div class="erp-page-heading"><div><p class="erp-kicker">SALES DOCUMENTS</p><h1>銷貨單</h1><p>品項金額自動計算；確認後可預覽列印或納入月結發票。</p></div></div>
    <section class="erp-panel erp-form-panel"><div class="erp-panel-title"><h2>${editing ? "修改銷貨單" : "建立銷貨單"}</h2><span class="erp-stage-tag">${editing && editing.sourceTransactionId ? "已由庫存銷貨帶入" : "銷貨作業"}</span></div>
      ${canEdit ? `<form id="erpSalesForm" class="erp-form">
        <div class="erp-form-row"><label>銷貨單號<input name="orderNo" value="${value("orderNo",erpOrderNumber())}" required maxlength="40"></label><label>銷貨日期<input name="orderDate" type="date" value="${value("orderDate",todayStr())}" required></label></div>
        <div class="erp-form-row"><label>已建檔客戶<select name="customerId"><option value="">尚未選擇／使用原始客戶名稱</option>${customerOptions}</select></label><label>客戶名稱 <b>*</b><input name="customerName" value="${value("customerName")}" required maxlength="80" placeholder="可由來源自動帶入"></label></div>
        <div class="erp-form-row"><label>稅別<select name="taxMode"><option value="no_tax"${selected("taxMode","no_tax","no_tax")}>不計稅</option><option value="tax_included"${selected("taxMode","tax_included")}>含稅</option><option value="tax_excluded"${selected("taxMode","tax_excluded")}>未稅外加（5%）</option></select></label><label>業務／經手人<input name="salesperson" value="${value("salesperson",currentUser ? currentUser.name : "")}" maxlength="50"></label></div>
        <div class="erp-line-box"><p>品項明細</p><div class="erp-form-row"><label>品項來源<select name="itemSource"><option value="tire"${selected("itemSource","tire","tire")}>輪胎</option><option value="kyb"${selected("itemSource","kyb")}>KYB 避震器</option><option value="custom"${selected("itemSource","custom")}>其他品項</option></select></label><label>品項名稱 <b>*</b><input name="itemName" required maxlength="100" value="${value("itemName")}" placeholder="先手動輸入；下一階段串接庫存"></label></div><div class="erp-form-row erp-form-row-3"><label>數量 <b>*</b><input name="quantity" type="number" min="1" step="1" value="${value("quantity",1)}" required></label><label>單價 <b>*</b><input name="unitPrice" type="number" min="0" step="1" value="${value("unitPrice",0)}" required></label><label>品項金額<input name="amount" type="number" readonly value="0"></label></div></div>
        <div class="erp-tax-summary" id="erpTaxSummary"><div><span>未稅金額</span><strong id="erpSubtotalText">NT$ 0</strong></div><div><span>營業稅 <em id="erpTaxRateText">0%</em></span><strong id="erpTaxText">NT$ 0</strong></div><div class="erp-grand-total"><span>含稅總計</span><strong id="erpTotalText">NT$ 0</strong></div></div>
        <label>備註<textarea name="notes" rows="2" maxlength="300" placeholder="例如：送貨日期、特殊需求">${value("notes")}</textarea></label>
        <div class="erp-form-actions">${actionButtons}</div>
      </form>` : '<div class="erp-confirmed-note">此銷貨單已確認，可預覽列印，並可於「月結開票」納入同一客戶的發票。</div>'}
    </section>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">ALL SALES DOCUMENTS</p><h2>銷貨單清單</h2></div><span class="erp-counter">${erpSalesOrdersCache.length} 筆</span></div>
      ${erpSalesOrdersCache.length ? '<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>單號</th><th>客戶</th><th>品項</th><th>未稅</th><th>稅額</th><th>總計</th><th>狀態</th><th>操作</th></tr></thead><tbody>' + erpSalesOrdersCache.map(o => { const t=erpDisplayTotals(o); return '<tr><td><strong>' + erpEscape(o.orderNo) + '</strong></td><td>' + erpEscape(o.customerName) + '</td><td>' + erpEscape(o.itemName) + ' × ' + (Number(o.quantity)||0) + '</td><td>NT$ ' + erpMoney(t.subtotal) + '</td><td>NT$ ' + erpMoney(t.taxAmount) + '</td><td><strong>NT$ ' + erpMoney(t.totalAmount) + '</strong></td><td>' + erpStatus(o.status) + (o.invoiceId ? '<br><span class="erp-invoiced-tag">已月結</span>' : '') + '</td><td>' + (o.status === "confirmed" ? '<button class="erp-print-btn" data-erp-print="' + erpEscape(o.id) + '">預覽列印</button>' : '<button class="erp-edit-btn" data-erp-edit="' + erpEscape(o.id) + '">修改</button>') + (o.status === "submitted" ? '<button class="erp-confirm-btn" data-erp-confirm="' + erpEscape(o.id) + '">確認</button>' : '') + '</td></tr>'; }).join("") + '</tbody></table></div>' : '<div class="erp-empty">尚未建立銷貨單。可從「待建立銷貨單」帶入原本的庫存銷貨資料。</div>'}
    </section>`;
  const form = document.getElementById("erpSalesForm");
  if(form){
    const refreshTax = () => {
      const calc = erpTotals({ quantity:form.elements.quantity.value, unitPrice:form.elements.unitPrice.value, taxMode:form.elements.taxMode.value, lineAmount:Number(form.elements.quantity.value||0)*Number(form.elements.unitPrice.value||0) });
      form.elements.amount.value = calc.lineAmount;
      document.getElementById("erpSubtotalText").textContent = "NT$ " + erpMoney(calc.subtotal);
      document.getElementById("erpTaxText").textContent = "NT$ " + erpMoney(calc.taxAmount);
      document.getElementById("erpTotalText").textContent = "NT$ " + erpMoney(calc.totalAmount);
      document.getElementById("erpTaxRateText").textContent = calc.taxRate ? "5%" : "0%";
    };
    form.addEventListener("submit", e => saveErpSalesOrder(e, editing ? (editing.status || "draft") : "submitted"));
    form.elements.quantity.addEventListener("input", refreshTax);
    form.elements.unitPrice.addEventListener("input", refreshTax);
    form.elements.taxMode.addEventListener("change", refreshTax);
    form.elements.customerId.addEventListener("change", () => { const c=erpCustomersCache.find(x=>x.id===form.elements.customerId.value); if(c) form.elements.customerName.value=c.name; });
    const draftBtn=document.getElementById("erpSaveDraftBtn"); if(draftBtn) draftBtn.addEventListener("click",()=>saveErpSalesOrder(null,"draft"));
    const submitBtn=document.getElementById("erpSubmitSalesBtn"); if(submitBtn) submitBtn.addEventListener("click",()=>saveErpSalesOrder(null,"submitted"));
    const cancelBtn=document.getElementById("erpCancelEditBtn"); if(cancelBtn) cancelBtn.addEventListener("click",()=>{erpSalesEditingId=null;renderErpSales();});
    refreshTax();
  }
  el.querySelectorAll("[data-erp-edit]").forEach(btn=>btn.addEventListener("click",()=>{erpSalesEditingId=btn.dataset.erpEdit;renderErpSales();window.scrollTo({top:0,behavior:"smooth"});}));
  el.querySelectorAll("[data-erp-confirm]").forEach(btn=>btn.addEventListener("click",()=>confirmErpSalesOrder(btn.dataset.erpConfirm)));
  el.querySelectorAll("[data-erp-print]").forEach(btn=>btn.addEventListener("click",()=>{const o=erpSalesOrdersCache.find(x=>x.id===btn.dataset.erpPrint);if(o) openErpPrintPreview(o);}));
}

async function saveErpSalesOrder(event, status){
  if(event) event.preventDefault();
  const form=document.getElementById("erpSalesForm");
  if(!form.reportValidity()) return;
  const matchedCustomer=erpCustomersCache.find(c=>c.id===form.elements.customerId.value);
  const calc=erpTotals({quantity:form.elements.quantity.value,unitPrice:form.elements.unitPrice.value,taxMode:form.elements.taxMode.value,lineAmount:Number(form.elements.quantity.value||0)*Number(form.elements.unitPrice.value||0)});
  const submitBtn=event ? form.querySelector("button[type=submit]") : (status==="draft"?document.getElementById("erpSaveDraftBtn"):document.getElementById("erpSubmitSalesBtn"));
  if(submitBtn) submitBtn.disabled=true;
  const data={
    orderNo:form.elements.orderNo.value.trim(),orderDate:form.elements.orderDate.value,
    customerId:matchedCustomer?matchedCustomer.id:null,customerName:form.elements.customerName.value.trim(),
    taxMode:form.elements.taxMode.value,salesperson:form.elements.salesperson.value.trim(),
    itemSource:form.elements.itemSource.value,itemName:form.elements.itemName.value.trim(),
    quantity:Number(form.elements.quantity.value)||0,unitPrice:Number(form.elements.unitPrice.value)||0,
    amount:calc.lineAmount,lineAmount:calc.lineAmount,subtotalAmount:calc.subtotal,taxAmount:calc.taxAmount,totalAmount:calc.totalAmount,taxRate:calc.taxRate,
    notes:form.elements.notes.value.trim(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name
  };
  try{
    if(erpSalesEditingId){ await db.collection("erpSalesOrders").doc(erpSalesEditingId).update({...data,status}); erpSalesEditingId=null; }
    else{ data.status=status;data.createdAt=firebase.firestore.FieldValue.serverTimestamp();data.createdByUid=currentUser.uid;data.createdByName=currentUser.name;await db.collection("erpSalesOrders").add(data);form.reset(); }
  }catch(err){console.error(err);alert("銷貨單儲存失敗，請稍後再試。");}
  finally{if(submitBtn)submitBtn.disabled=false;}
}

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
      ${outstanding.length ? '<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>日期</th><th>來源</th><th>品項</th><th>數量</th><th>客戶</th><th>業務</th><th></th></tr></thead><tbody>' + outstanding.map(s => '<tr><td>' + erpEscape(s.date || "-") + '</td><td><span class="erp-source-tag ' + s.sourceType + '">' + (s.sourceType === "tire" ? "輪胎" : "KYB") + '</span></td><td><strong>' + erpEscape(s.itemName) + '</strong></td><td>' + s.quantity + '</td><td>' + erpEscape(s.customerName || "未填寫") + '</td><td>' + erpEscape(s.salesperson || "-") + '</td><td><button class="erp-primary erp-transfer-btn" data-erp-transfer="' + erpEscape(s.key) + '">帶入 ERP</button></td></tr>').join("") + '</tbody></table></div>' : '<div class="erp-empty"><strong>目前沒有待轉銷貨。</strong><br>新建立的輪胎或 KYB 銷貨會自動出現在這裡。</div>'}
    </section>
    <section class="erp-panel erp-linked-panel"><div class="erp-panel-title"><div><p class="erp-kicker">LINKED SALES</p><h2>已帶入紀錄</h2></div></div>
      ${linked.size ? '<div class="erp-list">' + sources.filter(s => linked.has(s.key)).map(s => { const o=linked.get(s.key); return '<article class="erp-list-row"><div class="erp-avatar">' + (s.sourceType === "tire" ? "輪" : "K") + '</div><div><strong>' + erpEscape(s.itemName) + '</strong><p>' + erpEscape(o.orderNo) + " · " + erpEscape(s.date) + " · " + erpStatus(o.status) + '</p></div><button class="erp-edit-btn" data-erp-edit-linked="' + erpEscape(o.id) + '">查看／修改</button></article>'; }).join("") + '</div>' : '<div class="erp-empty">尚無已帶入紀錄。</div>'}
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
  const customer = erpCustomersCache.find(c => (c.name || "").trim() === source.customerName.trim());
  try{
    await db.collection("erpSalesOrders").add({
      orderNo:erpOrderNumber(), orderDate:source.date || todayStr(),
      customerId:customer ? customer.id : null, customerName:source.customerName || "",
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
 const el=document.getElementById("erp-page-sales");if(!el)return;const o=erpSalesEditingId?erpSalesOrdersCache.find(x=>x.id===erpSalesEditingId):null;
 const lines=erpOrderLines(o||{itemSource:"tire",quantity:1,unitPrice:0}), editable=!o||o.status!=="confirmed";
 const customers=erpCustomersCache.map(c=>'<option value="'+erpEscape(c.id)+'"'+(o&&o.customerId===c.id?" selected":"")+">"+erpEscape(c.name)+"</option>").join("");
 const val=(k,f="")=>erpEscape(o&&o[k]!=null?o[k]:f),sel=(k,x,f)=>((o&&o[k]===x)||(!o&&f===x)?" selected":"");
 el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">SALES DOCUMENTS</p><h1>銷貨單</h1><p>一張銷貨單可建立多個品項；確認後才能納入月結與應收。</p></div></div><section class="erp-panel erp-form-panel">'+(editable?'<form id="erpSalesForm" class="erp-form"><div class="erp-form-row"><label>銷貨單號<input name="orderNo" value="'+val("orderNo",erpOrderNumber())+'" required></label><label>銷貨日期<input name="orderDate" type="date" value="'+val("orderDate",todayStr())+'" required></label></div><div class="erp-form-row"><label>已建檔客戶<select name="customerId"><option value="">尚未選擇</option>'+customers+'</select></label><label>客戶名稱 <b>*</b><input name="customerName" value="'+val("customerName")+'" required></label></div><div class="erp-form-row"><label>稅別<select name="taxMode"><option value="no_tax"'+sel("taxMode","no_tax","no_tax")+'>不計稅</option><option value="tax_included"'+sel("taxMode","tax_included")+'>含稅</option><option value="tax_excluded"'+sel("taxMode","tax_excluded")+'>未稅外加（5%）</option></select></label><label>業務／經手人<input name="salesperson" value="'+val("salesperson",currentUser?currentUser.name:"")+'"></label></div><div class="erp-line-box"><p>品項明細</p><div class="erp-line-head"><span>來源</span><span>品項名稱</span><span>數量</span><span>單價</span><span>小計</span><span></span></div><div id="erpLineRows">'+lines.map(erpLineRow).join("")+'</div><button type="button" class="erp-secondary" id="erpAddLineBtn">＋ 新增品項</button></div><div class="erp-tax-summary"><div><span>未稅金額</span><strong id="erpSubtotalText">NT$ 0</strong></div><div><span>營業稅 <em id="erpTaxRateText">0%</em></span><strong id="erpTaxText">NT$ 0</strong></div><div class="erp-grand-total"><span>含稅總計</span><strong id="erpTotalText">NT$ 0</strong></div></div><label>備註<textarea name="notes" rows="2">'+val("notes")+'</textarea></label><div class="erp-form-actions"><button class="erp-secondary" type="button" id="erpCancelEditBtn">取消</button><button class="erp-secondary" type="button" id="erpSaveDraftBtn">儲存草稿</button><button class="erp-primary" type="submit">'+(o&&o.status==="draft"?"送出待確認":"儲存修改")+'</button></div></form>':'<div class="erp-confirmed-note">此銷貨單已確認，可列印並納入月結發票。</div>')+'</section><section class="erp-panel"><div class="erp-panel-title"><h2>銷貨單清單</h2><span class="erp-counter">'+erpSalesOrdersCache.length+' 筆</span></div>' +(erpSalesOrdersCache.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>單號</th><th>客戶</th><th>品項</th><th>未稅</th><th>稅額</th><th>總計</th><th>狀態</th><th>操作</th></tr></thead><tbody>'+erpSalesOrdersCache.map(x=>{const t=erpDisplayTotals(x);return '<tr><td><strong>'+erpEscape(x.orderNo)+'</strong></td><td>'+erpEscape(x.customerName)+'</td><td>'+erpLineSummary(x)+'</td><td>NT$ '+erpMoney(t.subtotal)+'</td><td>NT$ '+erpMoney(t.taxAmount)+'</td><td><strong>NT$ '+erpMoney(t.totalAmount)+'</strong></td><td>'+erpStatus(x.status)+(x.invoiceId?'<br><span class="erp-invoiced-tag">已月結</span>':'')+'</td><td>'+(x.status==="confirmed"?'<button class="erp-print-btn" data-print="'+x.id+'">預覽列印</button>':'<button class="erp-edit-btn" data-edit="'+x.id+'">修改</button>')+(x.status==="submitted"?'<button class="erp-confirm-btn" data-confirm="'+x.id+'">確認</button>':'')+'</td></tr>';}).join("")+'</tbody></table></div>':'<div class="erp-empty">尚無銷貨單。</div>')+'</section>';
 const form=document.getElementById("erpSalesForm");if(!form)return;
 const getLines=()=>[...form.querySelectorAll(".erp-line-row")].map(r=>({itemSource:r.querySelector(".line-source").value,itemName:r.querySelector(".line-name").value.trim(),quantity:Number(r.querySelector(".line-qty").value)||0,unitPrice:Number(r.querySelector(".line-price").value)||0})).filter(x=>x.itemName&&x.quantity>0);
 const refresh=()=>{const ls=getLines(),t=erpCalcLines(ls,form.elements.taxMode.value);[...form.querySelectorAll(".erp-line-row")].forEach(r=>{const q=Number(r.querySelector(".line-qty").value)||0,p=Number(r.querySelector(".line-price").value)||0;r.querySelector(".line-total").textContent=erpMoney(q*p);});document.getElementById("erpSubtotalText").textContent="NT$ "+erpMoney(t.subtotal);document.getElementById("erpTaxText").textContent="NT$ "+erpMoney(t.taxAmount);document.getElementById("erpTotalText").textContent="NT$ "+erpMoney(t.totalAmount);document.getElementById("erpTaxRateText").textContent=t.taxRate?"5%":"0%";};
 form.addEventListener("input",refresh);form.elements.taxMode.addEventListener("change",refresh);form.elements.customerId.addEventListener("change",()=>{const c=erpCustomersCache.find(x=>x.id===form.elements.customerId.value);if(c)form.elements.customerName.value=c.name;});document.getElementById("erpAddLineBtn").addEventListener("click",()=>{document.getElementById("erpLineRows").insertAdjacentHTML("beforeend",erpLineRow({itemSource:"custom",quantity:1},form.querySelectorAll(".erp-line-row").length));refresh();});form.addEventListener("click",e=>{if(e.target.classList.contains("erp-line-remove")){const rows=form.querySelectorAll(".erp-line-row");if(rows.length>1)e.target.closest(".erp-line-row").remove();refresh();}});document.getElementById("erpCancelEditBtn").addEventListener("click",()=>{erpSalesEditingId=null;renderErpSales();});document.getElementById("erpSaveDraftBtn").addEventListener("click",()=>saveErpMulti(form,getLines(),"draft"));form.addEventListener("submit",e=>{e.preventDefault();saveErpMulti(form,getLines(),o&&o.status==="submitted"?"submitted":"submitted");});refresh();
 el.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>{erpSalesEditingId=b.dataset.edit;renderErpSales();}));el.querySelectorAll("[data-confirm]").forEach(b=>b.addEventListener("click",()=>confirmErpSalesOrder(b.dataset.confirm)));el.querySelectorAll("[data-print]").forEach(b=>b.addEventListener("click",()=>openErpPrintPreview(erpSalesOrdersCache.find(x=>x.id===b.dataset.print))));
}
async function saveErpMulti(form,getLines,status){if(!form.reportValidity())return;const lines=getLines();if(!lines.length)return alert("請至少填寫一個品項。");const t=erpCalcLines(lines,form.elements.taxMode.value),customer=erpCustomersCache.find(c=>c.id===form.elements.customerId.value),data={orderNo:form.elements.orderNo.value.trim(),orderDate:form.elements.orderDate.value,customerId:customer?customer.id:null,customerName:form.elements.customerName.value.trim(),salesperson:form.elements.salesperson.value.trim(),taxMode:form.elements.taxMode.value,lines, itemSource:lines[0].itemSource,itemName:lines[0].itemName,quantity:lines[0].quantity,unitPrice:lines[0].unitPrice,lineAmount:t.lineAmount,amount:t.lineAmount,subtotalAmount:t.subtotal,taxAmount:t.taxAmount,totalAmount:t.totalAmount,taxRate:t.taxRate,notes:form.elements.notes.value.trim(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};try{if(erpSalesEditingId){await db.collection("erpSalesOrders").doc(erpSalesEditingId).update({...data,status});erpSalesEditingId=null;}else{await db.collection("erpSalesOrders").add({...data,status,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});form.reset();} }catch(e){console.error(e);alert("儲存失敗，請稍後再試。");}}
