// ERP 進貨單與應付帳：單據只記錄帳務，不直接異動輪胎／KYB 實體庫存。
let erpPurchaseEditingId=null;
function erpPurchaseNumber(){
  const d=new Date(),two=n=>String(n).padStart(2,"0");
  return "PI-"+d.getFullYear()+two(d.getMonth()+1)+two(d.getDate())+"-"+two(d.getHours())+two(d.getMinutes())+two(d.getSeconds());
}
function erpPurchaseVendors(){ return erpVendors(); }
function erpPurchaseLines(purchase){
  if(Array.isArray(purchase&&purchase.lines)&&purchase.lines.length) return purchase.lines;
  return [{itemName:"",quantity:1,unitPrice:0}];
}
function erpPurchaseTotals(lines,taxMode){
  const lineAmount=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0)*(Number(line.unitPrice)||0),0);
  return salesPricingTotals({lineAmount,taxMode:taxMode||"no_tax"});
}
function erpPurchaseLineRow(line,index){
  return '<div class="erp-line-row erp-purchase-line" data-purchase-line="'+index+'"><input class="purchase-item-name" value="'+erpEscape(line.itemName||"")+'" placeholder="品項名稱"><input class="purchase-line-qty" type="number" min="1" value="'+(Number(line.quantity)||1)+'"><input class="purchase-line-price" type="number" min="0" value="'+(Number(line.unitPrice)||0)+'"><strong class="purchase-line-total">NT$ 0</strong><button type="button" class="erp-line-remove" title="移除">×</button></div>';
}
function erpPurchaseReadLines(form){
  return [...form.querySelectorAll("[data-purchase-line]")].map(node=>({
    itemName:(node.querySelector(".purchase-item-name").value||"").trim(),
    quantity:Number(node.querySelector(".purchase-line-qty").value)||0,
    unitPrice:Number(node.querySelector(".purchase-line-price").value)||0
  })).filter(line=>line.itemName&&line.quantity>0);
}
function erpPurchaseRefreshTotals(form){
  const lines=erpPurchaseReadLines(form),total=erpPurchaseTotals(lines,form.elements.taxMode.value);
  form.querySelectorAll("[data-purchase-line]").forEach(node=>{
    const quantity=Number(node.querySelector(".purchase-line-qty").value)||0;
    const unitPrice=Number(node.querySelector(".purchase-line-price").value)||0;
    node.querySelector(".purchase-line-total").textContent="NT$ "+erpMoney(quantity*unitPrice);
  });
  const target=form.querySelector("#erpPurchaseTotal");
  if(target) target.innerHTML='<div><span>未稅金額</span><strong>NT$ '+erpMoney(total.subtotal)+'</strong></div><div><span>營業稅</span><strong>NT$ '+erpMoney(total.taxAmount)+'</strong></div><div class="erp-grand-total"><span>含稅總計</span><strong>NT$ '+erpMoney(total.totalAmount)+'</strong></div>';
}
function erpPurchaseFormHtml(editing){
  const vendors=erpPurchaseVendors();
  const lines=erpPurchaseLines(editing);
  return '<section class="erp-panel erp-form-panel"><div class="erp-panel-title"><div><p class="erp-kicker">PURCHASE DOCUMENT</p><h2>'+(editing?"修改進貨單草稿":"新增進貨單")+'</h2></div></div>'
    + '<p class="erp-form-hint">此進貨單僅建立應付帳，不會直接入庫。實體庫存請仍從「進銷貨管理」登錄進貨。</p>'
    + '<form id="erpPurchaseForm" class="erp-form"><div class="erp-form-row"><label>進貨單號<input name="purchaseNo" value="'+erpEscape(editing?editing.purchaseNo:erpPurchaseNumber())+'" required></label><label>進貨日期<input name="purchaseDate" type="date" value="'+erpEscape(editing?editing.purchaseDate:todayStr())+'" required></label></div>'
    + '<div class="erp-form-row"><label>廠商<select name="vendorId" required><option value="">請選擇廠商</option>'+vendors.map(vendor=>'<option value="'+erpEscape(vendor.id)+'"'+(editing&&editing.vendorId===vendor.id?" selected":"")+">"+erpEscape((vendor.partyCode?vendor.partyCode+"｜":"")+vendor.name)+"</option>").join("")+'</select></label><label>稅別<select name="taxMode"><option value="no_tax"'+(editing&&editing.taxMode==="no_tax"?" selected":"")+'>不計稅</option><option value="tax_included"'+(editing&&editing.taxMode==="tax_included"?" selected":"")+'>含稅</option><option value="tax_excluded"'+(editing&&editing.taxMode==="tax_excluded"?" selected":"")+'>未稅外加</option></select></label></div>'
    + '<label>進貨明細</label><div class="erp-line-grid erp-purchase-grid"><span>品項名稱</span><span>數量</span><span>單價</span><span>小計</span><span></span></div><div id="erpPurchaseLines">'+lines.map(erpPurchaseLineRow).join("")+'</div><button type="button" class="erp-secondary" id="erpPurchaseAddLine">＋ 新增品項</button>'
    + '<div class="erp-invoice-total" id="erpPurchaseTotal"></div><label>備註<textarea name="notes" rows="2">'+erpEscape(editing?editing.notes:"")+'</textarea></label>'
    + '<div class="erp-form-actions">'+(editing?'<button type="button" class="erp-secondary" id="erpPurchaseCancel">取消修改</button>':'')+'<button class="erp-primary">儲存草稿</button></div></form></section>';
}
function renderErpPurchases(){
  const el=document.getElementById("erp-page-purchases");
  if(!el) return;
  const editing=erpPurchaseEditingId?erpPurchasesCache.find(item=>item.id===erpPurchaseEditingId&&item.status==="draft"):null;
  const list=erpPurchasesCache.slice().sort((a,b)=>{
    const av=a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0;
    const bv=b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0;
    return bv-av;
  });
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">PURCHASES & PAYABLES</p><h1>進貨單與應付</h1><p>確認進貨單後才建立應付帳；付款則在「帳務與收款」統一沖帳。</p></div></div>'
    + erpPurchaseFormHtml(editing)
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">PURCHASE HISTORY</p><h2>進貨單清單</h2></div><span class="erp-counter">'+list.length+' 筆</span></div>'
    + (list.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>單號</th><th>日期</th><th>廠商</th><th>明細</th><th>總計</th><th>狀態</th><th></th></tr></thead><tbody>'
      +list.map(purchase=>'<tr><td><strong>'+erpEscape(purchase.purchaseNo)+'</strong></td><td>'+erpEscape(purchase.purchaseDate||"-")+'</td><td>'+erpEscape(purchase.vendorName||"-")+'</td><td>'+erpEscape((erpPurchaseLines(purchase)[0].itemName||"-"))+(erpPurchaseLines(purchase).length>1?" 等 "+erpPurchaseLines(purchase).length+" 項":"")+'</td><td>NT$ '+erpMoney(purchase.totalAmount)+'</td><td>'+erpEscape(purchase.status==="draft"?"草稿":purchase.status==="void"?"已作廢":"已確認")+'</td><td>'+(purchase.status==="draft"?'<button class="erp-edit-btn" data-purchase-edit="'+erpEscape(purchase.id)+'">修改</button><button class="erp-primary" data-purchase-confirm="'+erpEscape(purchase.id)+'">確認建立應付</button>':purchase.status==="confirmed"?'<button class="erp-edit-btn" data-purchase-void="'+erpEscape(purchase.id)+'">作廢</button>':'')+'</td></tr>').join("")
      +'</tbody></table></div>':'<div class="erp-empty">尚無進貨單。</div>')
    + '</section>';
  const form=document.getElementById("erpPurchaseForm");
  form.addEventListener("submit",saveErpPurchase);
  document.getElementById("erpPurchaseAddLine").addEventListener("click",()=>{
    const lines=document.getElementById("erpPurchaseLines");
    lines.insertAdjacentHTML("beforeend",erpPurchaseLineRow({},lines.children.length));
    erpPurchaseBindLines(form);
    erpPurchaseRefreshTotals(form);
  });
  const cancel=document.getElementById("erpPurchaseCancel");
  if(cancel) cancel.addEventListener("click",()=>{erpPurchaseEditingId=null;renderErpPurchases();});
  erpPurchaseBindLines(form);
  erpPurchaseRefreshTotals(form);
  el.querySelectorAll("[data-purchase-edit]").forEach(button=>button.addEventListener("click",()=>{erpPurchaseEditingId=button.dataset.purchaseEdit;renderErpPurchases();}));
  el.querySelectorAll("[data-purchase-confirm]").forEach(button=>button.addEventListener("click",()=>confirmErpPurchase(button.dataset.purchaseConfirm)));
  el.querySelectorAll("[data-purchase-void]").forEach(button=>button.addEventListener("click",()=>voidErpPurchase(button.dataset.purchaseVoid)));
}
function erpPurchaseBindLines(form){
  form.querySelectorAll(".purchase-item-name,.purchase-line-qty,.purchase-line-price,select[name=taxMode]").forEach(input=>input.oninput=()=>erpPurchaseRefreshTotals(form));
  form.querySelectorAll(".erp-line-remove").forEach(button=>button.onclick=()=>{
    const rows=form.querySelectorAll("[data-purchase-line]");
    if(rows.length<=1) return alert("至少保留一個品項。");
    button.closest("[data-purchase-line]").remove();
    erpPurchaseRefreshTotals(form);
  });
}
async function saveErpPurchase(event){
  event.preventDefault();
  const form=event.currentTarget,lines=erpPurchaseReadLines(form);
  if(!lines.length) return alert("請至少填寫一項進貨明細。");
  const vendor=erpPurchaseVendors().find(item=>item.id===form.elements.vendorId.value);
  if(!vendor) return alert("請選擇廠商。");
  const total=erpPurchaseTotals(lines,form.elements.taxMode.value);
  const data={purchaseNo:(form.elements.purchaseNo.value||"").trim(),purchaseDate:form.elements.purchaseDate.value,vendorId:vendor.id,vendorCode:vendor.partyCode||"",vendorName:vendor.name||"",taxMode:form.elements.taxMode.value,lines,itemName:lines[0].itemName,quantity:lines[0].quantity,unitPrice:lines[0].unitPrice,lineAmount:total.lineAmount,subtotalAmount:total.subtotal,taxAmount:total.taxAmount,totalAmount:total.totalAmount,taxRate:total.taxRate,notes:(form.elements.notes.value||"").trim(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name};
  try{
    if(erpPurchaseEditingId) await db.collection("erpPurchases").doc(erpPurchaseEditingId).update(data);
    else await db.collection("erpPurchases").add({...data,status:"draft",createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
    erpPurchaseEditingId=null;
  }catch(error){
    console.error(error);
    alert("儲存失敗："+(error.message||"請確認 Firebase Rules 權限。"));
  }
}
async function confirmErpPurchase(id){
  const purchase=erpPurchasesCache.find(item=>item.id===id);
  if(!purchase||purchase.status!=="draft") return;
  if(!confirm("確認這張進貨單並建立應付帳？此動作不會自動入庫。")) return;
  const purchaseRef=db.collection("erpPurchases").doc(id);
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(purchaseRef);
      if(!snap.exists||snap.data().status!=="draft") throw new Error("進貨單狀態已變更，請重新整理後再試。");
      const live=snap.data();
      const vendor=erpPartiesCache.find(item=>item.id===live.vendorId);
      const ledgerRef=erpAccountingCreatePayableLedger(tx,purchaseRef,live,vendor);
      tx.update(purchaseRef,{status:"confirmed",ledgerId:ledgerRef.id,confirmedAt:firebase.firestore.FieldValue.serverTimestamp(),confirmedByUid:currentUser.uid,confirmedByName:currentUser.name});
    });
    erpAccountingAudit("purchase_confirmed",id,{purchaseNo:purchase.purchaseNo,totalAmount:purchase.totalAmount});
  }catch(error){
    console.error(error);
    alert("確認失敗："+(error.message||""));
  }
}
async function voidErpPurchase(id){
  const purchase=erpPurchasesCache.find(item=>item.id===id);
  if(!purchase||purchase.status!=="confirmed") return;
  if(!confirm("作廢這張進貨單？已建立的應付帳也會作廢；不會影響庫存。")) return;
  try{
    await db.runTransaction(async tx=>{
      const purchaseRef=db.collection("erpPurchases").doc(id);
      const purchaseSnap=await tx.get(purchaseRef);
      if(!purchaseSnap.exists||purchaseSnap.data().status!=="confirmed") throw new Error("進貨單狀態已變更。");
      const live=purchaseSnap.data();
      if(!live.ledgerId) throw new Error("找不到對應應付帳。");
      const ledgerRef=db.collection(ERP_ACCOUNTING.ledger).doc(live.ledgerId);
      const ledgerSnap=await tx.get(ledgerRef);
      if(!ledgerSnap.exists) throw new Error("找不到對應應付帳。");
      const ledger=ledgerSnap.data();
      if(erpAccountingNumber(ledger.settledAmount)>0) throw new Error("此進貨單已有付款沖帳，請先作廢相關付款後才能作廢。");
      tx.update(purchaseRef,{status:"void",voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
      tx.update(ledgerRef,{status:"void",balanceAmount:0,voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
    });
    erpAccountingAudit("purchase_voided",id,{purchaseNo:purchase.purchaseNo});
  }catch(error){
    console.error(error);
    alert("作廢失敗："+(error.message||""));
  }
}
