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
        <form id="erpCustomerForm" class="erp-form"><label>客戶編號<input name="partyCode" maxlength="20" placeholder="留空自動產生 CS0001"><small>格式：CS0001；管理者可指定或修改。</small></label>
          <label>客戶名稱 <b>*</b><input name="name" required maxlength="80" placeholder="例如：正享汽車保修廠"></label>
          <div class="erp-form-row"><label>聯絡人<input name="contact" maxlength="40" placeholder="姓名"></label><label>聯絡電話<input name="phone" maxlength="30" placeholder="電話或手機"></label></div>
          <div class="erp-form-row"><label>統一編號<input name="taxId" maxlength="20" placeholder="選填"></label><label>付款條件<input name="paymentTerms" maxlength="40" placeholder="例如：月結 30 天"></label></div>
          <label>信用等級<select name="creditLevel">${PARTY_CREDIT_LEVELS.map(l=>`<option value="${l}" ${l==="正常"?"selected":""}>${l}</option>`).join("")}</select></label>
          <label>地址<input name="address" maxlength="160" placeholder="選填"></label>
          <label>備註<textarea name="notes" rows="2" maxlength="300" placeholder="選填"></textarea></label>
          <button class="erp-primary" type="submit">${ERP_ICONS.add} 儲存客戶</button>
        </form>
        <div class="erp-sidebar-note" style="margin-top:14px;">如果你有舊版「客戶管理」留下、還沒轉過來的資料，可以按下面按鈕搬移（可重複按，已搬過的不會重複建立）。<br>
          <button class="erp-secondary" id="erpPartyMigrateBtn" type="button" style="margin-top:8px;">搬移舊客戶資料</button><button class="erp-secondary" id="erpPartyCodeFillBtn" type="button" style="margin:8px 0 0 6px;">補齊未編號客戶</button>
          <div id="erpPartyMigrateStatus" style="margin-top:6px;font-size:12px;color:var(--erp-muted,#888);"></div>
        </div>
      </section>
      <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">CUSTOMERS</p><h2>客戶清單</h2></div><span class="erp-counter">${parties.length} 位</span></div>
        ${parties.length ? '<div class="erp-list">' + parties.map(c => '<article class="erp-list-row"><div class="erp-avatar">' + erpEscape((c.name || "?").slice(0,1)) + '</div><div><strong><span class="erp-source-tag" style="margin-right:7px;">' + erpEscape(c.partyCode || "未編號") + '</span>' + erpEscape(c.name) + '</strong><p>' + ([c.contact, c.phone, c.paymentTerms, c.creditLevel].filter(Boolean).map(erpEscape).join(" · ") || "尚未填寫聯絡資訊") + '</p></div><button class="erp-edit-btn" data-party-code="' + erpEscape(c.id) + '">修改編號</button></article>').join("") + '</div>' : '<div class="erp-empty">尚未有客戶資料。</div>'}
      </section>
    </div>`;
  const form = document.getElementById("erpCustomerForm");
  if(form) form.addEventListener("submit", saveErpParty);
  const migrateBtn = document.getElementById("erpPartyMigrateBtn");
  if(migrateBtn) migrateBtn.addEventListener("click", migrateLegacyErpCustomers);
  const fillBtn = document.getElementById("erpPartyCodeFillBtn");
  if(fillBtn) fillBtn.addEventListener("click", fillMissingCustomerCodes);
  el.querySelectorAll("[data-party-code]").forEach(btn => btn.addEventListener("click", () => editErpPartyCode(btn.dataset.partyCode)));
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


// 客戶編號：使用交易與索引集合，避免兩人同時新增或修改時重複。
function normalizePartyCode(value){ return String(value || "").replace(/\s+/g, "").toUpperCase(); }
function isValidCustomerCode(value){ return /^CS\d{4,}$/.test(value); }

async function allocateCustomerCode(transaction, partyId){
  const counterRef = db.collection("erpSystemCounters").doc("customerCode");
  const counterSnap = await transaction.get(counterRef);
  let next = Math.max(1, Number(counterSnap.exists ? counterSnap.data().nextNumber : 1) || 1);
  for(let safety=0; safety<10000; safety++, next++){
    const code = "CS" + String(next).padStart(4, "0");
    const indexRef = db.collection("erpPartyCodeIndex").doc(code);
    const indexSnap = await transaction.get(indexRef);
    if(!indexSnap.exists || indexSnap.data().partyId === partyId) return {code, indexRef, counterRef, nextNumber:next + 1};
  }
  throw new Error("無法配置客戶編號，請聯絡管理者。");
}

async function setErpPartyCode(partyId, requestedCode){
  const partyRef = db.collection("erpParties").doc(partyId);
  await db.runTransaction(async transaction => {
    const partySnap = await transaction.get(partyRef);
    if(!partySnap.exists) throw new Error("找不到客戶資料。");
    const current = partySnap.data() || {};
    let code = normalizePartyCode(requestedCode);
    let allocated = null;
    if(!code) allocated = await allocateCustomerCode(transaction, partyId);
    if(allocated) code = allocated.code;
    if(!isValidCustomerCode(code)) throw new Error("客戶編號格式需為 CS0001。");
    const indexRef = allocated ? allocated.indexRef : db.collection("erpPartyCodeIndex").doc(code);
    const indexSnap = allocated ? null : await transaction.get(indexRef);
    if(indexSnap && indexSnap.exists && indexSnap.data().partyId !== partyId) throw new Error("客戶編號「" + code + "」已被其他客戶使用。");
    const oldCode = normalizePartyCode(current.partyCode);
    transaction.update(partyRef, {partyCode:code,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name});
    transaction.set(indexRef, {partyId:partyId,type:"customer",updatedAt:firebase.firestore.FieldValue.serverTimestamp()}, {merge:true});
    if(allocated) transaction.set(allocated.counterRef, {nextNumber:allocated.nextNumber,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}, {merge:true});
    if(oldCode && oldCode !== code) transaction.delete(db.collection("erpPartyCodeIndex").doc(oldCode));
  });
}


// 覆寫原本儲存：新增客戶可指定 CS 編號或自動帶號。
async function saveErpParty(event){
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  if(!name) return;
  const requestedCode = normalizePartyCode(form.elements.partyCode.value);
  if(requestedCode && !userHasAnyRole("admin")) return alert("只有管理者可指定客戶編號。");
  if(requestedCode && !isValidCustomerCode(requestedCode)) return alert("客戶編號格式需為 CS0001。");
  const btn = form.querySelector("button[type=submit]");
  btn.disabled=true; btn.textContent="儲存中…";
  const partyRef = db.collection("erpParties").doc();
  try{
    await db.runTransaction(async transaction => {
      let code=requestedCode, allocated=null;
      if(!code) allocated=await allocateCustomerCode(transaction, partyRef.id);
      if(allocated) code=allocated.code;
      const indexRef=allocated ? allocated.indexRef : db.collection("erpPartyCodeIndex").doc(code);
      const indexSnap=allocated ? null : await transaction.get(indexRef);
      if(indexSnap && indexSnap.exists) throw new Error("客戶編號「" + code + "」已被其他客戶使用。");
      transaction.set(partyRef, {
        type:"customer",partyCode:code,name,
        contact:form.elements.contact.value.trim(),phone:form.elements.phone.value.trim(),
        taxId:form.elements.taxId.value.trim(),paymentTerms:form.elements.paymentTerms.value.trim(),
        creditLevel:form.elements.creditLevel.value || "正常",
        address:form.elements.address.value.trim(),notes:form.elements.notes.value.trim(),
        active:true,createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        createdByUid:currentUser.uid,createdByName:currentUser.name,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedByUid:currentUser.uid,updatedByName:currentUser.name
      });
      transaction.set(indexRef, {partyId:partyRef.id,type:"customer",updatedAt:firebase.firestore.FieldValue.serverTimestamp()}, {merge:true});
      if(allocated) transaction.set(allocated.counterRef, {nextNumber:allocated.nextNumber,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}, {merge:true});
    });
    form.reset();
  }catch(err){
    console.error(err);
    alert("客戶儲存失敗：" + (err.message || "請確認 Firebase Rules 已加入 ERP 權限後再試一次。"));
  }finally{
    btn.disabled=false; btn.innerHTML=ERP_ICONS.add + " 儲存客戶";
  }
}

async function editErpPartyCode(id){
  if(!userHasAnyRole("admin")) return alert("只有管理者可修改客戶編號。");
  const party=erpCustomerParties().find(p => p.id === id);
  if(!party) return;
  const answer=prompt("請輸入客戶編號（格式 CS0001）",party.partyCode || "");
  if(answer === null) return;
  const code=normalizePartyCode(answer);
  if(!isValidCustomerCode(code)) return alert("客戶編號格式需為 CS0001。");
  try{ await setErpPartyCode(id,code); }
  catch(err){ console.error(err); alert("修改客戶編號失敗："+(err.message || "")); }
}

async function fillMissingCustomerCodes(){
  if(!userHasAnyRole("admin")) return alert("只有管理者可補齊客戶編號。");
  const missing=erpCustomerParties().filter(p => !normalizePartyCode(p.partyCode));
  const statusEl=document.getElementById("erpPartyMigrateStatus");
  if(!missing.length){
    if(statusEl) statusEl.textContent="所有客戶都已有編號。";
    return;
  }
  if(!confirm("將為 " + missing.length + " 位未編號客戶建立 CS 編號；不會修改既有銷貨資料。")) return;
  if(statusEl) statusEl.textContent="補編號中…";
  try{
    for(const party of missing) await setErpPartyCode(party.id,"");
    if(statusEl) statusEl.textContent="完成，已為 " + missing.length + " 位客戶補上編號。";
  }catch(err){
    console.error(err);
    if(statusEl) statusEl.textContent="補編號失敗："+(err.message || "");
  }
}
