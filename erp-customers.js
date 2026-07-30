// ERP 客戶管理
function renderErpCustomers(){
  const el = document.getElementById("erp-page-customers");
  if(!el) return;
  el.innerHTML = `
    <div class="erp-page-heading"><div><p class="erp-kicker">CUSTOMER DIRECTORY</p><h1>客戶管理</h1><p>建立可重複選用的客戶資料，之後會串接銷貨、對帳與應收。</p></div></div>
    <div class="erp-content-grid">
      <section class="erp-panel erp-form-panel"><div class="erp-panel-title"><h2>新增客戶</h2></div>
        <form id="erpCustomerForm" class="erp-form">
          <label>客戶名稱 <b>*</b><input name="name" required maxlength="80" placeholder="例如：正享汽車保修廠"></label>
          <div class="erp-form-row"><label>聯絡人<input name="contact" maxlength="40" placeholder="姓名"></label><label>聯絡電話<input name="phone" maxlength="30" placeholder="電話或手機"></label></div>
          <div class="erp-form-row"><label>統一編號<input name="taxId" maxlength="20" placeholder="選填"></label><label>付款條件<input name="paymentTerms" maxlength="40" placeholder="例如：月結 30 天"></label></div>
          <label>地址<input name="address" maxlength="160" placeholder="選填"></label>
          <label>備註<textarea name="notes" rows="2" maxlength="300" placeholder="選填"></textarea></label>
          <button class="erp-primary" type="submit">${ERP_ICONS.add} 儲存客戶</button>
        </form>
      </section>
      <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">CUSTOMERS</p><h2>客戶清單</h2></div><span class="erp-counter">${erpCustomersCache.length} 位</span></div>
        ${erpCustomersCache.length ? '<div class="erp-list">' + erpCustomersCache.map(c => '<article class="erp-list-row"><div class="erp-avatar">' + erpEscape((c.name || "?").slice(0,1)) + '</div><div><strong>' + erpEscape(c.name) + '</strong><p>' + [c.contact, c.phone, c.paymentTerms].filter(Boolean).map(erpEscape).join(" · ") || "尚未填寫聯絡資訊" + '</p></div></article>').join("") + '</div>' : '<div class="erp-empty">尚未有客戶資料。</div>'}
      </section>
    </div>`;
  const form = document.getElementById("erpCustomerForm");
  if(form) form.addEventListener("submit", saveErpCustomer);
}

async function saveErpCustomer(event){
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  if(!name) return;
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "儲存中…";
  try{
    await db.collection("erpCustomers").add({
      name, contact:form.elements.contact.value.trim(), phone:form.elements.phone.value.trim(),
      taxId:form.elements.taxId.value.trim(), paymentTerms:form.elements.paymentTerms.value.trim(),
      address:form.elements.address.value.trim(), notes:form.elements.notes.value.trim(),
      active:true, createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      createdByUid:currentUser.uid, createdByName:currentUser.name
    });
    form.reset();
  }catch(err){
    console.error(err); alert("客戶儲存失敗，請確認 Firebase Rules 已加入 ERP 權限後再試一次。");
  }finally{ btn.disabled=false; btn.innerHTML=ERP_ICONS.add + " 儲存客戶"; }
}

