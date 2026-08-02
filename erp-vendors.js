// ERP 廠商主檔：共用 erpParties，type 固定為 vendor。
// 廠商編號比照客戶，使用 erpPartyCodeIndex 索引 + erpSystemCounters 計數器，
// 全部在同一個 Firestore transaction 內完成，避免兩個人同時新增拿到同一個 VN 編號。
let erpVendorEditingId=null;
function erpVendors(){
  return erpPartiesCache.filter(party=>party.type==="vendor");
}
function normalizeVendorCode(value){ return String(value||"").replace(/\s+/g,"").toUpperCase(); }
function isValidVendorCode(value){ return /^VN\d{4,}$/.test(value); }
async function allocateVendorCode(transaction, partyId){
  const counterRef=db.collection("erpSystemCounters").doc("vendorCode");
  const counterSnap=await transaction.get(counterRef);
  let next=Math.max(1,Number(counterSnap.exists?counterSnap.data().nextNumber:1)||1);
  for(let safety=0; safety<10000; safety++, next++){
    const code="VN"+String(next).padStart(4,"0");
    const indexRef=db.collection("erpPartyCodeIndex").doc(code);
    const indexSnap=await transaction.get(indexRef);
    if(!indexSnap.exists||indexSnap.data().partyId===partyId) return {code,indexRef,counterRef,nextNumber:next+1};
  }
  throw new Error("無法配置廠商編號，請聯絡管理者。");
}
function renderErpVendors(){
  const el=document.getElementById("erp-page-vendors");
  if(!el) return;
  const editing=erpVendorEditingId?erpVendors().find(item=>item.id===erpVendorEditingId):null;
  const vendors=erpVendors().slice().sort((a,b)=>(a.partyCode||a.name||"").localeCompare((b.partyCode||b.name||""),"zh-Hant"));
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">VENDOR DIRECTORY</p><h1>廠商管理</h1><p>廠商與客戶共用往來對象主檔，但進貨與應付帳會獨立管理。</p></div></div>'
    + '<div class="erp-content-grid"><section class="erp-panel erp-form-panel"><div class="erp-panel-title"><h2>'+(editing?"修改廠商":"新增廠商")+'</h2></div><form id="erpVendorForm" class="erp-form">'
    + '<label>廠商編號<input name="partyCode" maxlength="20" placeholder="留空自動產生 VN0001" value="'+erpEscape(editing?(editing.partyCode||""):"")+'"><small>格式：VN0001；留空會自動取下一個可用編號。</small></label>'
    + '<label>廠商名稱 <b>*</b><input name="name" required maxlength="80" value="'+erpEscape(editing?editing.name:"")+'"></label>'
    + '<div class="erp-form-row"><label>聯絡人<input name="contact" maxlength="40" value="'+erpEscape(editing?editing.contact:"")+'"></label><label>聯絡電話<input name="phone" maxlength="30" value="'+erpEscape(editing?editing.phone:"")+'"></label></div>'
    + '<div class="erp-form-row"><label>統一編號<input name="taxId" maxlength="20" value="'+erpEscape(editing?editing.taxId:"")+'"></label><label>付款條件<input name="paymentTerms" maxlength="40" placeholder="例如：月結 30 天" value="'+erpEscape(editing?editing.paymentTerms:"")+'"></label></div>'
    + '<label>地址<input name="address" maxlength="160" value="'+erpEscape(editing?editing.address:"")+'"></label><label>備註<textarea name="notes" rows="2" maxlength="300">'+erpEscape(editing?editing.notes:"")+'</textarea></label>'
    + '<div class="erp-form-actions">'+(editing?'<button type="button" class="erp-secondary" id="erpVendorCancel">取消修改</button>':'')+'<button class="erp-primary" type="submit">'+(editing?"儲存修改":"儲存廠商")+'</button></div></form></section>'
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">VENDORS</p><h2>廠商清單</h2></div><span class="erp-counter">'+vendors.length+' 位</span></div>'
    + (vendors.length?'<div class="erp-list">'+vendors.map(vendor=>'<article class="erp-list-row"><div class="erp-avatar">'+erpEscape((vendor.name||"?").slice(0,1))+'</div><div><strong><span class="erp-source-tag" style="margin-right:7px;">'+erpEscape(vendor.partyCode||"未編號")+'</span>'+erpEscape(vendor.name)+'</strong><p>'+([vendor.contact,vendor.phone,vendor.paymentTerms].filter(Boolean).map(erpEscape).join(" · ")||"尚未填寫聯絡資訊")+'</p></div><button class="erp-edit-btn" data-erp-vendor-edit="'+erpEscape(vendor.id)+'">修改</button></article>').join("")+'</div>':'<div class="erp-empty">尚未有廠商資料。</div>')
    + '</section></div>';
  document.getElementById("erpVendorForm").addEventListener("submit",saveErpVendor);
  const cancel=document.getElementById("erpVendorCancel");
  if(cancel) cancel.addEventListener("click",()=>{erpVendorEditingId=null;renderErpVendors();});
  el.querySelectorAll("[data-erp-vendor-edit]").forEach(button=>button.addEventListener("click",()=>{erpVendorEditingId=button.dataset.erpVendorEdit;renderErpVendors();}));
}
async function saveErpVendor(event){
  event.preventDefault();
  const form=event.currentTarget;
  const requested=normalizeVendorCode(form.elements.partyCode.value);
  const name=(form.elements.name.value||"").trim();
  if(!name) return alert("請填寫廠商名稱。");
  if(requested&&!isValidVendorCode(requested)) return alert("廠商編號格式需為 VN0001。");
  const editingId=erpVendorEditingId;
  const partyRef=editingId?db.collection("erpParties").doc(editingId):db.collection("erpParties").doc();
  const fields={
    type:"vendor",name,
    contact:(form.elements.contact.value||"").trim(),
    phone:(form.elements.phone.value||"").trim(),
    taxId:(form.elements.taxId.value||"").trim(),
    paymentTerms:(form.elements.paymentTerms.value||"").trim(),
    address:(form.elements.address.value||"").trim(),
    notes:(form.elements.notes.value||"").trim(),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
    updatedByUid:currentUser.uid,updatedByName:currentUser.name
  };
  try{
    await db.runTransaction(async transaction=>{
      // 交易規則：所有讀取都必須排在寫入之前。
      let oldCode="";
      if(editingId){
        const partySnap=await transaction.get(partyRef);
        if(!partySnap.exists) throw new Error("找不到廠商資料，請重新整理後再試。");
        oldCode=normalizeVendorCode((partySnap.data()||{}).partyCode);
      }
      let code=requested,allocated=null;
      if(!code) allocated=await allocateVendorCode(transaction,partyRef.id);
      if(allocated) code=allocated.code;
      const indexRef=allocated?allocated.indexRef:db.collection("erpPartyCodeIndex").doc(code);
      if(!allocated){
        const indexSnap=await transaction.get(indexRef);
        if(indexSnap.exists&&indexSnap.data().partyId!==partyRef.id) throw new Error("編號「"+code+"」已被其他往來對象使用。");
      }
      const payload={...fields,partyCode:code};
      if(editingId) transaction.set(partyRef,payload,{merge:true});
      else transaction.set(partyRef,{...payload,active:true,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
      transaction.set(indexRef,{partyId:partyRef.id,type:"vendor",updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      if(allocated) transaction.set(allocated.counterRef,{nextNumber:allocated.nextNumber,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      if(oldCode&&oldCode!==code) transaction.delete(db.collection("erpPartyCodeIndex").doc(oldCode));
    });
    erpAccountingAudit(editingId?"vendor_updated":"vendor_created",partyRef.id,{name});
    erpVendorEditingId=null;
    renderErpVendors();
  }catch(error){
    console.error(error);
    alert("儲存廠商失敗："+(error.message||"請確認 Firebase Rules 權限。"));
  }
}
