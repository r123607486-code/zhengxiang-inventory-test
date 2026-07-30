// ============================================================
// ERP 管理中心（第一階段）
// 範圍：客戶、銷貨訂單草稿／送出／確認、即時儀表板。
// 此模組不會扣輪胎或 KYB 庫存，也不會建立應收帳款。
// ============================================================

let erpCustomersCache = [];
let erpSalesOrdersCache = [];
let erpListenersStarted = false;
let erpView = "dashboard";
let erpTireTransactionsCache = [];
let erpKybTransactionsCache = [];
let erpTireItemsCache = [];
let erpKybItemsCache = [];
let erpSalesEditingId = null;

const ERP_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 18h7M17.5 14.5v7"/></svg>',
  customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.6-3.2 2.5-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 8h5m-2.5-2.5v5"/></svg>',
  sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 12h8M8 16h6"/></svg>',
  transfer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h11m0 0-3-3m3 3-3 3M20 17H9m0 0 3 3m-3-3 3-3"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>',
  add: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>'
};

function erpEscape(value){
  return escapeHtml(value == null ? "" : value);
}
function erpDate(value){
  if(!value) return "-";
  if(typeof value.toDate === "function") return value.toDate().toLocaleDateString("zh-TW");
  return String(value).slice(0, 10);
}
function erpDateTime(value){
  if(!value) return "-";
  if(typeof value.toDate === "function") return value.toDate().toLocaleString("zh-TW", {hour12:false});
  return String(value);
}
function erpMoney(value){
  const n = Number(value) || 0;
  return n.toLocaleString("zh-TW", {maximumFractionDigits:0});
}
function erpStatus(status){
  const map = { draft:["草稿","draft"], submitted:["已送出","submitted"], confirmed:["已確認","confirmed"] };
  const v = map[status] || ["草稿","draft"];
  return '<span class="erp-status erp-status-' + v[1] + '">' + v[0] + '</span>';
}
function erpOrderNumber(){
  const d = new Date();
  const two = n => String(n).padStart(2, "0");
  return "SO-" + d.getFullYear() + two(d.getMonth()+1) + two(d.getDate()) + "-" +
    two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
}

function openErpWorkspace(){
  if(!currentUser || currentUser.role !== "admin") return;
  const app = document.getElementById("erpApp");
  document.getElementById("categoryScreen").classList.add("hidden");
  document.getElementById("app").classList.add("hidden");
  app.classList.remove("hidden");
  if(!app.dataset.ready){
    app.dataset.ready = "true";
    buildErpWorkspace();
  }
  startErpListeners();
  showErpView(erpView);
}

function buildErpWorkspace(){
  const app = document.getElementById("erpApp");
  app.innerHTML = `
    <header class="erp-topbar">
      <div class="erp-brand">
        <span class="erp-brand-mark">${ERP_ICONS.dashboard}</span>
        <div><strong>ERP System Design</strong><small>銷售與帳務作業平台</small></div>
      </div>
      <div class="erp-user"><span id="erpWhoLabel"></span><button class="erp-quiet-btn" id="erpBackBtn">${ERP_ICONS.back} 回品項選單</button></div>
    </header>
    <div class="erp-layout">
      <aside class="erp-sidebar">
        <button class="erp-nav active" data-erp-view="dashboard">${ERP_ICONS.dashboard}<span>營運總覽</span></button>
        <button class="erp-nav" data-erp-view="customers">${ERP_ICONS.customers}<span>客戶管理</span></button>
        <button class="erp-nav" data-erp-view="sales">${ERP_ICONS.sales}<span>銷貨單</span></button>
        <button class="erp-nav" data-erp-view="transfers">${ERP_ICONS.transfer}<span>待建立銷貨單</span></button>
        <div class="erp-sidebar-note">第一階段<br>不重複扣庫存・不產生應收</div>
      </aside>
      <main class="erp-main">
        <section class="erp-page" id="erp-page-dashboard"></section>
        <section class="erp-page hidden" id="erp-page-customers"></section>
        <section class="erp-page hidden" id="erp-page-sales"></section>
        <section class="erp-page hidden" id="erp-page-transfers"></section>
      </main>
    </div>`;
  document.getElementById("erpWhoLabel").textContent = currentUser.name + "｜管理者";
  document.getElementById("erpBackBtn").addEventListener("click", showCategoryScreen);
  app.querySelectorAll("[data-erp-view]").forEach(btn => btn.addEventListener("click", () => showErpView(btn.dataset.erpView)));
}

function showErpView(view){
  erpView = view || "dashboard";
  document.querySelectorAll(".erp-page").forEach(page => page.classList.add("hidden"));
  const active = document.getElementById("erp-page-" + erpView);
  if(active) active.classList.remove("hidden");
  document.querySelectorAll("[data-erp-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.erpView === erpView));
  renderErpViews();
}

function startErpListeners(){
  if(erpListenersStarted) return;
  erpListenersStarted = true;
  db.collection("erpCustomers").onSnapshot(snap => {
    erpCustomersCache = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => (a.name || "").localeCompare(b.name || "", "zh-Hant"));
    renderErpViews();
  }, err => erpShowDataError(err));
  db.collection("erpSalesOrders").onSnapshot(snap => {
    erpSalesOrdersCache = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => {
      const av = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const bv = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return bv-av;
    });
    renderErpViews();
  }, err => erpShowDataError(err));
  db.collection("transactions").onSnapshot(snap => {
    erpTireTransactionsCache = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderErpViews();
  }, err => console.error("ERP 輪胎銷貨讀取失敗", err));
  db.collection("kybTransactions").onSnapshot(snap => {
    erpKybTransactionsCache = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderErpViews();
  }, err => console.error("ERP KYB 銷貨讀取失敗", err));
  db.collection("items").onSnapshot(snap => {
    erpTireItemsCache = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderErpViews();
  }, err => console.error("ERP 輪胎品項讀取失敗", err));
  db.collection("kybItems").onSnapshot(snap => {
    erpKybItemsCache = snap.docs.map(d => ({id:d.id, ...d.data()}));
    renderErpViews();
  }, err => console.error("ERP KYB 品項讀取失敗", err));
}
function erpShowDataError(err){
  console.error("ERP 資料讀取失敗", err);
  const target = document.getElementById("erp-page-" + erpView);
  if(target && !target.dataset.rendered){
    target.innerHTML = '<div class="erp-empty"><strong>ERP 資料尚未取得</strong><br><span>請先依照下方提供的 Firebase Rules 新增 ERP 權限，發布後重新整理即可。</span></div>';
  }
}

function renderErpViews(){
  if(!document.getElementById("erpApp") || document.getElementById("erpApp").classList.contains("hidden")) return;
  renderErpDashboard();
  renderErpCustomers();
  renderErpSales();
  renderErpTransfers();
}

function renderErpDashboard(){
  const el = document.getElementById("erp-page-dashboard");
  if(!el) return;
  const submitted = erpSalesOrdersCache.filter(o => o.status === "submitted").length;
  const confirmed = erpSalesOrdersCache.filter(o => o.status === "confirmed").length;
  const latest = erpSalesOrdersCache.slice(0,5);
  el.innerHTML = `
    <div class="erp-page-heading"><div><p class="erp-kicker">WORKSPACE OVERVIEW</p><h1>早安，${erpEscape(currentUser ? currentUser.name : "")}</h1><p>從這裡掌握銷貨作業的目前進度。</p></div><div class="erp-heading-actions"><button class="erp-primary" data-erp-go="customers">${ERP_ICONS.add} 新增客戶</button><button class="erp-secondary" data-erp-go="sales">${ERP_ICONS.add} 建立銷貨單</button></div></div>
    <div class="erp-metric-grid">
      <article class="erp-metric"><span>客戶數</span><strong>${erpCustomersCache.length}</strong><small>可供建立銷貨單</small></article>
      <article class="erp-metric"><span>待確認銷貨單</span><strong>${submitted}</strong><small>已送出，尚未確認</small></article>
      <article class="erp-metric"><span>本期已確認</span><strong>${confirmed}</strong><small>尚未扣庫存或入帳</small></article>
    </div>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">RECENT SALES</p><h2>最近銷貨訂單</h2></div><button class="erp-text-btn" data-erp-go="sales">查看全部</button></div>
      ${latest.length ? '<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>單號</th><th>客戶</th><th>日期</th><th>金額</th><th>狀態</th></tr></thead><tbody>' + latest.map(o => '<tr><td><strong>' + erpEscape(o.orderNo) + '</strong></td><td>' + erpEscape(o.customerName || "-") + '</td><td>' + erpDate(o.orderDate) + '</td><td>NT$ ' + erpMoney(o.amount) + '</td><td>' + erpStatus(o.status) + '</td></tr>').join("") + '</tbody></table></div>' : '<div class="erp-empty">尚未建立銷貨訂單。先新增客戶，再建立第一張銷貨單。</div>'}
    </section>`;
  el.querySelectorAll("[data-erp-go]").forEach(btn => btn.addEventListener("click", () => showErpView(btn.dataset.erpGo)));
}

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

function renderErpSales(){
  const el = document.getElementById("erp-page-sales");
  if(!el) return;
  const editing = erpSalesEditingId ? erpSalesOrdersCache.find(o => o.id === erpSalesEditingId) : null;
  const customerOptions = erpCustomersCache.map(c => '<option value="' + erpEscape(c.id) + '"' + ((editing && editing.customerId === c.id) ? " selected" : "") + '>' + erpEscape(c.name) + '</option>').join("");
  const value = (field, fallback="") => erpEscape(editing && editing[field] != null ? editing[field] : fallback);
  const selected = (field, option, fallback) => ((editing && editing[field] === option) || (!editing && fallback === option)) ? " selected" : "";
  el.innerHTML = `
    <div class="erp-page-heading"><div><p class="erp-kicker">SALES DOCUMENTS</p><h1>銷貨單</h1><p>來源銷貨帶入後，僅在此補齊帳務資料；不會再次扣庫存。</p></div></div>
    <section class="erp-panel erp-form-panel"><div class="erp-panel-title"><h2>${editing ? "修改銷貨訂單" : "建立銷貨訂單"}</h2><span class="erp-stage-tag">${editing && editing.sourceTransactionId ? "已由庫存銷貨帶入" : "第一階段"}</span></div>
      <form id="erpSalesForm" class="erp-form">
        <div class="erp-form-row"><label>銷貨單號<input name="orderNo" value="${value("orderNo",erpOrderNumber())}" required maxlength="40"></label><label>訂單日期<input name="orderDate" type="date" value="${value("orderDate",todayStr())}" required></label></div>
        <div class="erp-form-row"><label>已建檔客戶<select name="customerId"><option value="">尚未選擇／使用原始客戶名稱</option>${customerOptions}</select></label><label>客戶名稱 <b>*</b><input name="customerName" value="${value("customerName")}" required maxlength="80" placeholder="可由來源自動帶入"></label></div>
        <div class="erp-form-row"><label>稅別<select name="taxMode"><option value="no_tax"${selected("taxMode","no_tax","no_tax")}>不計稅</option><option value="tax_included"${selected("taxMode","tax_included")}>含稅</option><option value="tax_excluded"${selected("taxMode","tax_excluded")}>未稅外加</option></select></label><label>業務／經手人<input name="salesperson" value="${value("salesperson",currentUser ? currentUser.name : "")}" maxlength="50"></label></div>
        <div class="erp-line-box"><p>品項明細</p><div class="erp-form-row"><label>品項來源<select name="itemSource"><option value="tire"${selected("itemSource","tire","tire")}>輪胎</option><option value="kyb"${selected("itemSource","kyb")}>KYB 避震器</option><option value="custom"${selected("itemSource","custom")}>其他品項</option></select></label><label>品項名稱 <b>*</b><input name="itemName" required maxlength="100" value="${value("itemName")}" placeholder="先手動輸入；下一階段串接庫存"></label></div><div class="erp-form-row erp-form-row-3"><label>數量 <b>*</b><input name="quantity" type="number" min="1" step="1" value="${value("quantity",1)}" required></label><label>單價<input name="unitPrice" type="number" min="0" step="1" value="${value("unitPrice",0)}"></label><label>金額<input name="amount" type="number" min="0" step="1" value="${value("amount",0)}"></label></div></div>
        <label>備註<textarea name="notes" rows="2" maxlength="300" placeholder="例如：送貨日期、特殊需求">${value("notes")}</textarea></label>
        <div class="erp-form-actions">${editing ? '<button class="erp-secondary" type="button" id="erpCancelEditBtn">取消修改</button>' : '<button class="erp-secondary" type="button" id="erpSaveDraftBtn">儲存草稿</button>'}<button class="erp-primary" type="submit">${editing ? "儲存修改" : "送出等待確認"}</button></div>
      </form>
    </section>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">ALL SALES ORDERS</p><h2>訂單清單</h2></div><span class="erp-counter">${erpSalesOrdersCache.length} 筆</span></div>
      ${erpSalesOrdersCache.length ? '<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>單號</th><th>客戶</th><th>品項</th><th>金額</th><th>稅別</th><th>狀態</th><th>建立時間</th><th>操作</th></tr></thead><tbody>' + erpSalesOrdersCache.map(o => '<tr><td><strong>' + erpEscape(o.orderNo) + '</strong></td><td>' + erpEscape(o.customerName) + '</td><td>' + erpEscape(o.itemName) + ' × ' + (Number(o.quantity)||0) + '</td><td>NT$ ' + erpMoney(o.amount) + '</td><td>' + ({no_tax:"不計稅",tax_included:"含稅",tax_excluded:"未稅外加"}[o.taxMode] || "-") + '</td><td>' + erpStatus(o.status) + '</td><td>' + erpDateTime(o.createdAt) + '</td><td>' + (o.status === "confirmed" ? '<span class="erp-locked">已確認</span>' : '<button class="erp-edit-btn" data-erp-edit="' + erpEscape(o.id) + '">修改</button>') + (o.status === "submitted" ? '<button class="erp-confirm-btn" data-erp-confirm="' + erpEscape(o.id) + '">確認</button>' : '') + '</td></tr>').join("") + '</tbody></table></div>' : '<div class="erp-empty">尚未建立銷貨訂單。可從「待轉銷貨」帶入原本的庫存銷貨資料。</div>'}
    </section>`;
  const form = document.getElementById("erpSalesForm");
  if(form){
    form.addEventListener("submit", e => saveErpSalesOrder(e, editing ? (editing.status || "draft") : "submitted"));
    const draftBtn = document.getElementById("erpSaveDraftBtn");
    if(draftBtn) draftBtn.addEventListener("click", () => saveErpSalesOrder(null, "draft"));
    const cancelBtn = document.getElementById("erpCancelEditBtn");
    if(cancelBtn) cancelBtn.addEventListener("click", () => { erpSalesEditingId=null; renderErpSales(); });
    form.elements.customerId.addEventListener("change", () => {
      const c = erpCustomersCache.find(x => x.id === form.elements.customerId.value);
      if(c) form.elements.customerName.value = c.name;
    });
  }
  el.querySelectorAll("[data-erp-edit]").forEach(btn => btn.addEventListener("click", () => { erpSalesEditingId = btn.dataset.erpEdit; renderErpSales(); window.scrollTo({top:0,behavior:"smooth"}); }));
  el.querySelectorAll("[data-erp-confirm]").forEach(btn => btn.addEventListener("click", () => confirmErpSalesOrder(btn.dataset.erpConfirm)));
}

async function saveErpSalesOrder(event, status){
  if(event) event.preventDefault();
  const form = document.getElementById("erpSalesForm");
  if(!form.reportValidity()) return;
  const matchedCustomer = erpCustomersCache.find(c => c.id === form.elements.customerId.value);
  const submitBtn = form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  const data = {
    orderNo:form.elements.orderNo.value.trim(), orderDate:form.elements.orderDate.value,
    customerId:matchedCustomer ? matchedCustomer.id : null, customerName:form.elements.customerName.value.trim(),
    taxMode:form.elements.taxMode.value, salesperson:form.elements.salesperson.value.trim(),
    itemSource:form.elements.itemSource.value, itemName:form.elements.itemName.value.trim(),
    quantity:Number(form.elements.quantity.value)||0, unitPrice:Number(form.elements.unitPrice.value)||0,
    amount:Number(form.elements.amount.value)||0, notes:form.elements.notes.value.trim(),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp(), updatedByUid:currentUser.uid, updatedByName:currentUser.name
  };
  try{
    if(erpSalesEditingId){
      await db.collection("erpSalesOrders").doc(erpSalesEditingId).update(data);
      erpSalesEditingId = null;
    }else{
      data.status=status; data.createdAt=firebase.firestore.FieldValue.serverTimestamp();
      data.createdByUid=currentUser.uid; data.createdByName=currentUser.name;
      await db.collection("erpSalesOrders").add(data);
      form.reset();
    }
  }catch(err){
    console.error(err); alert("銷貨單儲存失敗，請稍後再試。");
  }finally{ submitBtn.disabled=false; }
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

