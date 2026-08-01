// ERP 客戶管理（往來對象主檔 erpParties，type 固定 "customer"）
const PARTY_CREDIT_LEVELS = ["優良","正常","需留意","黑名單"];

function renderErpParties(){
  const el = document.getElementById("erp-page-customers");
  if(!el) return;
  const parties = erpPartiesCache.filter(p => (p.type || "customer") === "customer");
  el.innerHTML = `
    <div class="erp-page-heading"><div><p class="erp-kicker">CUSTOMER DIRECTORY</p><h1>客戶管理</h1><p>建立可重複選用的客戶資料，之後會串接銷貨、對帳與應收。</p></div></div>
    <div class="erp-content-grid">
      <section class="erp-panel erp-form-panel"><div class="erp-panel-title"><h2>新增客戶</h2></div>
        <form id="erpCustomerForm" class="erp-form">
          <label>客戶名稱 <b>*</b><input name="name" required maxlength="80" placeholder="例如：正享汽車保修廠"></label>
          <div class="erp-form-row"><label>聯絡人<input name="contact" maxlength="40" placeholder="姓名"></label><label>聯絡電話<input name="phone" maxlength="30" placeholder="電話或手機"></label></div>
          <div class="erp-form-row"><label>統一編號<input name="taxId" maxlength="20" placeholder="選填"></label><label>付款條件<input name="paymentTerms" maxlength="40" placeholder="例如：月結 30 天"></label></div>
          <label>信用等級<select name="creditLevel">${PARTY_CREDIT_LEVELS.map(l=>`<option value="${l}" ${l==="正常"?"selected":""}>${l}</option>`).join("")}</select></label>
          <label>地址<input name="address" maxlength="160" placeholder="選填"></label>
          <label>備註<textarea name="notes" rows="2" maxlength="300" placeholder="選填"></textarea></label>
          <button class="erp-primary" type="submit">${ERP_ICONS.add} 儲存客戶</button>
        </form>
        <div class="erp-sidebar-note" style="margin-top:14px;">如果你有舊版「客戶管理」留下、還沒轉過來的資料，可以按下面按鈕搬移（可重複按，已搬過的不會重複建立）。<br>
          <button class="erp-secondary" id="erpPartyMigrateBtn" type="button" style="margin-top:8px;">搬移舊客戶資料</button>
          <div id="erpPartyMigrateStatus" style="margin-top:6px;font-size:12px;color:var(--erp-muted,#888);"></div>
        </div>
      </section>
      <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">CUSTOMERS</p><h2>客戶清單</h2></div><span class="erp-counter">${parties.length} 位</span></div>
        ${parties.length ? '<div class="erp-list">' + parties.map(c => '<article class="erp-list-row"><div class="erp-avatar">' + erpEscape((c.name || "?").slice(0,1)) + '</div><div><strong>' + erpEscape(c.name) + '</strong><p>' + ([c.contact, c.phone, c.paymentTerms, c.creditLevel].filter(Boolean).map(erpEscape).join(" · ") || "尚未填寫聯絡資訊") + '</p></div></article>').join("") + '</div>' : '<div class="erp-empty">尚未有客戶資料。</div>'}
      </section>
    </div>`;
  const form = document.getElementById("erpCustomerForm");
  if(form) form.addEventListener("submit", saveErpParty);
  const migrateBtn = document.getElementById("erpPartyMigrateBtn");
  if(migrateBtn) migrateBtn.addEventListener("click", migrateLegacyErpCustomers);
}

async function saveErpParty(event){
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  if(!name) return;
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "儲存中…";
  try{
    await db.collection("erpParties").add({
      type:"customer",
      name, contact:form.elements.contact.value.trim(), phone:form.elements.phone.value.trim(),
      taxId:form.elements.taxId.value.trim(), paymentTerms:form.elements.paymentTerms.value.trim(),
      creditLevel: form.elements.creditLevel.value || "正常",
      address:form.elements.address.value.trim(), notes:form.elements.notes.value.trim(),
      active:true, createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      createdByUid:currentUser.uid, createdByName:currentUser.name
    });
    form.reset();
  }catch(err){
    console.error(err); alert("客戶儲存失敗，請確認 Firebase Rules 已加入 ERP 權限後再試一次。");
  }finally{ btn.disabled=false; btn.innerHTML=ERP_ICONS.add + " 儲存客戶"; }
}

// 一次性搬移：把舊的 erpCustomers 資料複製到新的 erpParties，沿用原本的文件 ID
// （這樣既有銷貨單／發票裡存的 customerId 不會失效），舊 collection 保留不刪，當備份。
// 用 doc(id).set(...) 覆蓋寫入，重複點擊不會產生重複資料，只會覆蓋成一樣的內容。
async function migrateLegacyErpCustomers(){
  const statusEl = document.getElementById("erpPartyMigrateStatus");
  if(statusEl) statusEl.textContent = "搬移中…";
  try{
    const oldSnap = await db.collection("erpCustomers").get();
    if(oldSnap.empty){
      if(statusEl) statusEl.textContent = "沒有找到舊版客戶資料，可能已經搬移過，或本來就沒有舊資料。";
      return;
    }
    let migrated = 0;
    for(const doc of oldSnap.docs){
      const d = doc.data() || {};
      await db.collection("erpParties").doc(doc.id).set({
        type:"customer",
        name: d.name || "", contact: d.contact || "", phone: d.phone || "",
        taxId: d.taxId || "", paymentTerms: d.paymentTerms || "",
        creditLevel: d.creditLevel || "正常",
        address: d.address || "", notes: d.notes || "",
        active: d.active !== false,
        createdAt: d.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
        createdByUid: d.createdByUid || null, createdByName: d.createdByName || "",
        migratedFromErpCustomersAt: firebase.firestore.FieldValue.serverTimestamp()
      }, {merge:true});
      migrated++;
    }
    if(statusEl) statusEl.textContent = `搬移完成，共處理 ${migrated} 筆（舊的 erpCustomers 資料原封不動保留，可當備份）。`;
  }catch(e){
    console.error(e);
    if(statusEl) statusEl.textContent = "搬移失敗："+e.message;
  }
}
