// ERP 廠商主檔：共用 erpParties，type 固定為 vendor。
let erpVendorEditingId=null;
function erpVendors(){
  return erpPartiesCache.filter(party=>party.type==="vendor");
}
function erpVendorCode(){
  const max=erpVendors().reduce((largest,vendor)=>{
    const match=String(vendor.partyCode||"").match(/^VN(\d+)$/i);
    return match?Math.max(largest,Number(match[1])):largest;
  },0);
  return "VN"+String(max+1).padStart(4,"0");
}
function renderErpVendors(){
  const el=document.getElementById("erp-page-vendors");
  if(!el) return;
  const editing=erpVendorEditingId?erpVendors().find(item=>item.id===erpVendorEditingId):null;
  const vendors=erpVendors().slice().sort((a,b)=>(a.partyCode||a.name||"").localeCompare((b.partyCode||b.name||""),"zh-Hant"));
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">VENDOR DIRECTORY</p><h1>廠商管理</h1><p>廠商與客戶共用往來對象主檔，但進貨與應付帳會獨立管理。</p></div></div>'
    + '<div class="erp-content-grid"><section class="erp-panel erp-form-panel"><div class="erp-panel-title"><h2>'+(editing?"修改廠商":"新增廠商")+'</h2></div><form id="erpVendorForm" class="erp-form">'
    + '<label>廠商編號<input name="partyCode" maxlength="20" value="'+erpEscape(editing?editing.partyCode:erpVendorCode())+'"><small>預設格式：VN0001，可由管理者修改。</small></label>'
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
  const code=(form.elements.partyCode.value||"").trim().toUpperCase();
  const name=(form.elements.name.value||"").trim();
  if(!name) return alert("請填寫廠商名稱。");
  if(code&&erpVendors().some(vendor=>vendor.id!==erpVendorEditingId&&String(vendor.partyCode||"").toUpperCase()===code)) return alert("廠商編號已存在，請換一個編號。");
  const data={type:"vendor",partyCode:code,name,contact:(form.elements.contact.value||"").trim(),phone:(form.elements.phone.value||"").trim(),taxId:(form.elements.taxId.value||"").trim(),paymentTerms:(form.elements.paymentTerms.value||"").trim(),address:(form.elements.address.value||"").trim(),notes:(form.elements.notes.value||"").trim(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name};
  try{
    if(erpVendorEditingId) await db.collection("erpParties").doc(erpVendorEditingId).update(data);
    else await db.collection("erpParties").add({...data,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
    erpAccountingAudit(erpVendorEditingId?"vendor_updated":"vendor_created",erpVendorEditingId||"new",{partyCode:code,name});
    erpVendorEditingId=null;
  }catch(error){
    console.error(error);
    alert("儲存廠商失敗："+(error.message||"請確認 Firebase Rules 權限。"));
  }
}
