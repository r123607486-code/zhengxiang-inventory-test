// ============================================================
// ERP 管理中心（第一階段）
// 範圍：客戶、銷貨訂單草稿／送出／確認、即時儀表板。
// 此模組不會扣輪胎或 KYB 庫存，也不會建立應收帳款。
// ============================================================

let erpCustomersCache = [];
let erpSalesOrdersCache = [];
let erpListenersStarted = false;
let erpView = "dashboard";

const ERP_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 18h7M17.5 14.5v7"/></svg>',
  customers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><path d="M3.5 20c.6-3.2 2.5-5 5.5-5s4.9 1.8 5.5 5"/><path d="M16 8h5m-2.5-2.5v5"/></svg>',
  sales: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3h10l4 4v14H5z"/><path d="M15 3v5h4M8 12h8M8 16h6"/></svg>',
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
        <div><strong>ERP 管理中心</strong><small>銷貨與帳務作業平台</small></div>
      </div>
      <div class="erp-user"><span id="erpWhoLabel"></span><button class="erp-quiet-btn" id="erpBackBtn">${ERP_ICONS.back} 回品項選單</button></div>
    </header>
    <div class="erp-layout">
      <aside class="erp-sidebar">
        <button class="erp-nav active" data-erp-view="dashboard">${ERP_ICONS.dashboard}<span>總覽</span></button>
        <button class="erp-nav" data-erp-view="customers">${ERP_ICONS.customers}<span>客戶管理</span></button>
        <button class="erp-nav" data-erp-view="sales">${ERP_ICONS.sales}<span>銷貨訂單</span></button>
        <div class="erp-sidebar-note">第一階段<br>不扣庫存・不產生應收</div>
      </aside>
      <main class="erp-main">
        <section class="erp-page" id="erp-page-dashboard"></section>
        <section class="erp-page hidden" id="erp-page-customers"></section>
        <section class="erp-page hidden" id="erp-page-sales"></section>
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
  const customerOptions = erpCustomersCache.map(c => '<option value="' + erpEscape(c.id) + '">' + erpEscape(c.name) + '</option>').join("");
  el.innerHTML = `
    <div class="erp-page-heading"><div><p class="erp-kicker">SALES ORDER</p><h1>銷貨訂單</h1><p>先完成流程練習；目前不扣庫存，也不會產生應收帳款。</p></div></div>
    <section class="erp-panel erp-form-panel"><div class="erp-panel-title"><h2>建立銷貨訂單</h2><span class="erp-stage-tag">第一階段</span></div>
      ${erpCustomersCache.length ? `<form id="erpSalesForm" class="erp-form">
        <div class="erp-form-row"><label>銷貨單號<input name="orderNo" value="${erpOrderNumber()}" required maxlength="40"></label><label>訂單日期<input name="orderDate" type="date" value="${todayStr()}" required></label></div>
        <div class="erp-form-row"><label>客戶 <b>*</b><select name="customerId" required><option value="">請選擇客戶</option>${customerOptions}</select></label><label>稅別（先記錄，尚未計算）<select name="taxMode"><option value="no_tax">不計稅</option><option value="tax_included">含稅</option><option value="tax_excluded">未稅外加</option></select></label></div>
        <div class="erp-line-box"><p>品項明細</p><div class="erp-form-row"><label>品項來源<select name="itemSource"><option value="tire">輪胎</option><option value="kyb">KYB 避震器</option><option value="custom">其他品項</option></select></label><label>品項名稱 <b>*</b><input name="itemName" required maxlength="100" placeholder="先手動輸入；下一階段串接庫存"></label></div><div class="erp-form-row erp-form-row-3"><label>數量 <b>*</b><input name="quantity" type="number" min="1" step="1" value="1" required></label><label>單價<input name="unitPrice" type="number" min="0" step="1" value="0"></label><label>金額<input name="amount" type="number" min="0" step="1" value="0"></label></div></div>
        <label>備註<textarea name="notes" rows="2" maxlength="300" placeholder="例如：送貨日期、特殊需求"></textarea></label>
        <div class="erp-form-actions"><button class="erp-secondary" type="button" id="erpSaveDraftBtn">儲存草稿</button><button class="erp-primary" type="submit">送出等待確認</button></div>
      </form>` : '<div class="erp-empty"><strong>請先建立客戶</strong><br><button class="erp-text-btn" id="erpGoCustomers">前往新增客戶</button></div>'}
    </section>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">ALL SALES ORDERS</p><h2>訂單清單</h2></div><span class="erp-counter">${erpSalesOrdersCache.length} 筆</span></div>
      ${erpSalesOrdersCache.length ? '<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>單號</th><th>客戶</th><th>品項</th><th>金額</th><th>稅別</th><th>狀態</th><th>建立時間</th><th></th></tr></thead><tbody>' + erpSalesOrdersCache.map(o => '<tr><td><strong>' + erpEscape(o.orderNo) + '</strong></td><td>' + erpEscape(o.customerName) + '</td><td>' + erpEscape(o.itemName) + ' × ' + (Number(o.quantity)||0) + '</td><td>NT$ ' + erpMoney(o.amount) + '</td><td>' + ({no_tax:"不計稅",tax_included:"含稅",tax_excluded:"未稅外加"}[o.taxMode] || "-") + '</td><td>' + erpStatus(o.status) + '</td><td>' + erpDateTime(o.createdAt) + '</td><td>' + (o.status === "submitted" ? '<button class="erp-confirm-btn" data-erp-confirm="' + erpEscape(o.id) + '">確認</button>' : '') + '</td></tr>').join("") + '</tbody></table></div>' : '<div class="erp-empty">尚未建立銷貨訂單。</div>'}
    </section>`;
  const form = document.getElementById("erpSalesForm");
  if(form){
    form.addEventListener("submit", e => saveErpSalesOrder(e, "submitted"));
    document.getElementById("erpSaveDraftBtn").addEventListener("click", () => saveErpSalesOrder(null, "draft"));
  }
  const goCustomers = document.getElementById("erpGoCustomers");
  if(goCustomers) goCustomers.addEventListener("click", () => showErpView("customers"));
  el.querySelectorAll("[data-erp-confirm]").forEach(btn => btn.addEventListener("click", () => confirmErpSalesOrder(btn.dataset.erpConfirm)));
}

async function saveErpSalesOrder(event, status){
  if(event) event.preventDefault();
  const form = document.getElementById("erpSalesForm");
  if(!form.reportValidity()) return;
  const customer = erpCustomersCache.find(c => c.id === form.elements.customerId.value);
  if(!customer) return alert("請先選擇客戶。");
  const submitBtn = status === "draft" ? document.getElementById("erpSaveDraftBtn") : form.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try{
    await db.collection("erpSalesOrders").add({
      orderNo:form.elements.orderNo.value.trim(), orderDate:form.elements.orderDate.value,
      customerId:customer.id, customerName:customer.name, taxMode:form.elements.taxMode.value,
      itemSource:form.elements.itemSource.value, itemName:form.elements.itemName.value.trim(),
      quantity:Number(form.elements.quantity.value)||0, unitPrice:Number(form.elements.unitPrice.value)||0,
      amount:Number(form.elements.amount.value)||0, notes:form.elements.notes.value.trim(),
      status, createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      createdByUid:currentUser.uid, createdByName:currentUser.name
    });
    form.reset();
  }catch(err){
    console.error(err); alert("銷貨單儲存失敗，請確認 Firebase Rules 已加入 ERP 權限後再試一次。");
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
