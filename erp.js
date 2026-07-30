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
let erpInvoicesCache = [];
let erpInvoiceFilter = { customerName:"", from:"", to:"" };
let erpReceivablesCache = [];
let erpReceiptsCache = [];

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
        <button class="erp-nav" data-erp-view="invoices">${ERP_ICONS.sales}<span>月結開票</span></button>
        <button class="erp-nav" data-erp-view="receivables">${ERP_ICONS.customers}<span>應收與收款</span></button>
        <div class="erp-sidebar-note">第三階段<br>銷貨・月結・應收帳款</div>
      </aside>
      <main class="erp-main">
        <section class="erp-page" id="erp-page-dashboard"></section>
        <section class="erp-page hidden" id="erp-page-customers"></section>
        <section class="erp-page hidden" id="erp-page-sales"></section>
        <section class="erp-page hidden" id="erp-page-transfers"></section>
        <section class="erp-page hidden" id="erp-page-invoices"></section>
        <section class="erp-page hidden" id="erp-page-receivables"></section>
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
  db.collection("erpInvoices").onSnapshot(snap => {
    erpInvoicesCache = snap.docs.map(d => ({id:d.id, ...d.data()})).sort((a,b) => {
      const av = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0;
      const bv = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0;
      return bv-av;
    });
    renderErpViews();
  }, err => console.error("ERP 月結發票讀取失敗", err));
  db.collection("erpReceivables").onSnapshot(snap => {
    erpReceivablesCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 應收帳款讀取失敗",err));
  db.collection("erpReceipts").onSnapshot(snap => {
    erpReceiptsCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 收款讀取失敗",err));
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
  renderErpInvoices();
  renderErpReceivables();
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
function erpDefaultInvoiceRange(){
  const now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),1);
  return {from:first.toISOString().slice(0,10),to:todayStr()};
}
function erpInvoiceCandidates(){
  return erpSalesOrdersCache.filter(o=>o.status==="confirmed"&&!o.invoiceId);
}
function erpInvoiceTotal(orders){
  return orders.reduce((sum,o)=>{const t=erpDisplayTotals(o);sum.subtotal+=t.subtotal;sum.taxAmount+=t.taxAmount;sum.totalAmount+=t.totalAmount;return sum;},{subtotal:0,taxAmount:0,totalAmount:0});
}
function erpInvoiceNumber(){
  const d=new Date(), two=n=>String(n).padStart(2,"0");
  return "INV-"+d.getFullYear()+two(d.getMonth()+1)+two(d.getDate())+"-"+two(d.getHours())+two(d.getMinutes())+two(d.getSeconds());
}
function renderErpInvoices(){
  const el=document.getElementById("erp-page-invoices");
  if(!el) return;
  const range=erpDefaultInvoiceRange();
  if(!erpInvoiceFilter.from) erpInvoiceFilter.from=range.from;
  if(!erpInvoiceFilter.to) erpInvoiceFilter.to=range.to;
  const candidates=erpInvoiceCandidates();
  const customerNames=[...new Set(candidates.map(o=>o.customerName||"未指定客戶"))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  const filtered=candidates.filter(o=>(!erpInvoiceFilter.customerName||(o.customerName||"未指定客戶")===erpInvoiceFilter.customerName)&&(!erpInvoiceFilter.from||o.orderDate>=erpInvoiceFilter.from)&&(!erpInvoiceFilter.to||o.orderDate<=erpInvoiceFilter.to));
  el.innerHTML=`
    <div class="erp-page-heading"><div><p class="erp-kicker">MONTHLY INVOICING</p><h1>月結開票</h1><p>選擇同一客戶、同一結帳期間的已確認銷貨單，合併建立一筆月結發票。</p></div></div>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">SELECT SALES DOCUMENTS</p><h2>選取本期銷貨單</h2></div><span class="erp-counter">${filtered.length} 筆可開票</span></div>
      <div class="erp-invoice-filters"><label>客戶<select id="erpInvoiceCustomer"><option value="">請選擇客戶</option>${customerNames.map(n=>'<option value="'+erpEscape(n)+'"'+(erpInvoiceFilter.customerName===n?" selected":"")+">"+erpEscape(n)+"</option>").join("")}</select></label><label>銷貨日期起<input type="date" id="erpInvoiceFrom" value="${erpEscape(erpInvoiceFilter.from)}"></label><label>銷貨日期迄<input type="date" id="erpInvoiceTo" value="${erpEscape(erpInvoiceFilter.to)}"></label><button class="erp-secondary" id="erpInvoiceFilterBtn">套用篩選</button></div>
      ${erpInvoiceFilter.customerName&&filtered.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th><input type="checkbox" id="erpInvoiceSelectAll"></th><th>銷貨日期</th><th>銷貨單號</th><th>品項</th><th>未稅</th><th>稅額</th><th>總計</th><th>稅別</th></tr></thead><tbody>'+filtered.map(o=>{const t=erpDisplayTotals(o);return '<tr><td><input type="checkbox" data-invoice-sale="'+erpEscape(o.id)+'"></td><td>'+erpEscape(o.orderDate||"-")+'</td><td><strong>'+erpEscape(o.orderNo)+'</strong></td><td>'+erpEscape(o.itemName)+' × '+(Number(o.quantity)||0)+'</td><td>NT$ '+erpMoney(t.subtotal)+'</td><td>NT$ '+erpMoney(t.taxAmount)+'</td><td>NT$ '+erpMoney(t.totalAmount)+'</td><td>'+erpTaxLabel(o.taxMode)+'</td></tr>';}).join("")+'</tbody></table></div><div class="erp-invoice-total" id="erpInvoiceTotal"><span>請勾選銷貨單以計算本次月結金額。</span></div><div class="erp-form-actions"><button class="erp-primary" id="erpCreateInvoiceBtn">建立月結發票</button></div>':(erpInvoiceFilter.customerName?'<div class="erp-empty">此客戶在選定期間沒有尚未開票的已確認銷貨單。</div>':'<div class="erp-empty"><strong>請先選擇客戶。</strong><br>系統只會將同一個客戶的銷貨單合併開票，避免帳務混在一起。</div>')}
    </section>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">INVOICE HISTORY</p><h2>已建立的月結發票</h2></div><span class="erp-counter">${erpInvoicesCache.length} 筆</span></div>
      ${erpInvoicesCache.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>發票編號</th><th>客戶</th><th>開票日期</th><th>銷貨單數</th><th>未稅</th><th>稅額</th><th>總計</th><th></th></tr></thead><tbody>'+erpInvoicesCache.map(inv=>'<tr><td><strong>'+erpEscape(inv.invoiceNo)+'</strong></td><td>'+erpEscape(inv.customerName)+'</td><td>'+erpEscape(inv.invoiceDate||"-")+'</td><td>'+((inv.saleOrderIds||[]).length)+' 筆</td><td>NT$ '+erpMoney(inv.subtotalAmount)+'</td><td>NT$ '+erpMoney(inv.taxAmount)+'</td><td><strong>NT$ '+erpMoney(inv.totalAmount)+'</strong></td><td><button class="erp-print-btn" data-erp-print-invoice="'+erpEscape(inv.id)+'">預覽列印</button></td></tr>').join("")+'</tbody></table></div>':'<div class="erp-empty">尚未建立月結發票。</div>'}
    </section>`;
  document.getElementById("erpInvoiceFilterBtn").addEventListener("click",()=>{
    erpInvoiceFilter={customerName:document.getElementById("erpInvoiceCustomer").value,from:document.getElementById("erpInvoiceFrom").value,to:document.getElementById("erpInvoiceTo").value};renderErpInvoices();
  });
  const checkboxes=[...el.querySelectorAll("[data-invoice-sale]")];
  const updateTotal=()=>{
    const picked=checkboxes.filter(x=>x.checked).map(x=>erpSalesOrdersCache.find(o=>o.id===x.dataset.invoiceSale)).filter(Boolean);
    const t=erpInvoiceTotal(picked), box=document.getElementById("erpInvoiceTotal");
    if(box) box.innerHTML='<div><span>本次合併銷貨單</span><strong>'+picked.length+' 筆</strong></div><div><span>未稅金額</span><strong>NT$ '+erpMoney(t.subtotal)+'</strong></div><div><span>營業稅 5%</span><strong>NT$ '+erpMoney(t.taxAmount)+'</strong></div><div class="erp-grand-total"><span>含稅總計</span><strong>NT$ '+erpMoney(t.totalAmount)+'</strong></div>';
  };
  const all=document.getElementById("erpInvoiceSelectAll");if(all)all.addEventListener("change",()=>{checkboxes.forEach(x=>x.checked=all.checked);updateTotal();});
  checkboxes.forEach(x=>x.addEventListener("change",updateTotal));
  const create=document.getElementById("erpCreateInvoiceBtn");if(create)create.addEventListener("click",createErpInvoice);
  el.querySelectorAll("[data-erp-print-invoice]").forEach(btn=>btn.addEventListener("click",()=>{const inv=erpInvoicesCache.find(x=>x.id===btn.dataset.erpPrintInvoice);if(inv)openErpPrintPreview(null,inv);}));
}
async function createErpInvoice(){
  const checked=[...document.querySelectorAll("[data-invoice-sale]:checked")];
  const selected=checked.map(x=>erpSalesOrdersCache.find(o=>o.id===x.dataset.invoiceSale)).filter(Boolean);
  if(!selected.length)return alert("請至少選擇一筆銷貨單。");
  const customerName=erpInvoiceFilter.customerName;
  if(!customerName||selected.some(o=>(o.customerName||"未指定客戶")!==customerName))return alert("月結發票只能合併同一位客戶的銷貨單。");
  if(selected.some(o=>o.status!=="confirmed"||o.invoiceId))return alert("選取內容已變更，請重新整理後再試。");
  const totals=erpInvoiceTotal(selected);
  if(!confirm("建立「"+customerName+"」的月結發票？\n共 "+selected.length+" 筆銷貨單，含稅總計 NT$ "+erpMoney(totals.totalAmount)+"。\n建立後將無法再次納入其他月結發票。"))return;
  const ref=db.collection("erpInvoices").doc();
  const invoiceNo=erpInvoiceNumber();
  const customer=erpCustomersCache.find(c=>(c.name||"")===customerName);
  const lines=selected.map(o=>{const t=erpDisplayTotals(o);return {saleOrderId:o.id,orderNo:o.orderNo,orderDate:o.orderDate,itemName:o.itemName,quantity:Number(o.quantity)||0,unitPrice:Number(o.unitPrice)||0,taxMode:o.taxMode||"no_tax",subtotalAmount:t.subtotal,taxAmount:t.taxAmount,totalAmount:t.totalAmount};});
  const batch=db.batch();
  batch.set(ref,{invoiceNo,invoiceDate:todayStr(),customerId:customer?customer.id:null,customerName,periodFrom:erpInvoiceFilter.from,periodTo:erpInvoiceFilter.to,saleOrderIds:selected.map(o=>o.id),lines,subtotalAmount:totals.subtotal,taxAmount:totals.taxAmount,totalAmount:totals.totalAmount,taxRate:0.05,status:"issued",createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
  selected.forEach(o=>batch.update(db.collection("erpSalesOrders").doc(o.id),{invoiceId:ref.id,invoiceNo, invoicedAt:firebase.firestore.FieldValue.serverTimestamp()}));
  try{await batch.commit();alert("月結發票已建立。你現在可以在下方的「已建立的月結發票」預覽列印。");}
  catch(err){console.error(err);alert("建立月結發票失敗。請確認 Firebase Rules 已加入 erpInvoices 權限後再試。");}
}
function erpPrintRows(lines){
  return lines.map((l,i)=>'<tr><td>'+String(i+1).padStart(2,"0")+'</td><td>'+erpEscape(l.itemName||"-")+'</td><td class="num">'+(Number(l.quantity)||0)+'</td><td class="num">'+erpMoney(l.unitPrice)+'</td><td class="num">'+erpMoney(l.subtotalAmount!=null?l.subtotalAmount:erpDisplayTotals(l).subtotal)+'</td></tr>').join("");
}
function openErpPrintPreview(order,invoice){
  const old=document.getElementById("erpPrintOverlay");if(old)old.remove();
  const isInvoice=!!invoice;
  const customerName=isInvoice?invoice.customerName:order.customerName;
  const customer=erpCustomersCache.find(c=>(isInvoice?invoice.customerId:order.customerId)&&c.id===(isInvoice?invoice.customerId:order.customerId));
  const lines=isInvoice?invoice.lines||[]:erpOrderLines(order).map(l=>({itemName:l.itemName,quantity:l.quantity,unitPrice:l.unitPrice,subtotalAmount:(Number(l.quantity)||0)*(Number(l.unitPrice)||0)}));
  const totals=isInvoice?{subtotal:Number(invoice.subtotalAmount)||0,taxAmount:Number(invoice.taxAmount)||0,totalAmount:Number(invoice.totalAmount)||0}:erpDisplayTotals(order);
  const docNo=isInvoice?invoice.invoiceNo:order.orderNo;
  const docDate=isInvoice?invoice.invoiceDate:order.orderDate;
  const overlay=document.createElement("div");
  overlay.id="erpPrintOverlay";overlay.className="erp-print-overlay";
  overlay.innerHTML='<div class="erp-print-actions"><button class="erp-secondary" id="erpClosePrint">關閉預覽</button><button class="erp-primary" id="erpDoPrint">列印</button></div><article class="erp-print-paper"><header><div><p>ERP SYSTEM DESIGN</p><h1>'+ (isInvoice?"月結銷貨明細／發票預覽":"銷貨單") +'</h1></div><div class="erp-print-docno"><span>單據編號</span><strong>'+erpEscape(docNo)+'</strong></div></header><section class="erp-print-info"><div><span>客戶名稱</span><strong>'+erpEscape(customerName||"未指定客戶")+'</strong></div><div><span>銷貨／開票日期</span><strong>'+erpEscape(docDate||"-")+'</strong></div><div><span>聯絡電話</span><strong>'+erpEscape(customer&&customer.phone||"")+'</strong></div><div><span>統一編號</span><strong>'+erpEscape(customer&&customer.taxId||"")+'</strong></div></section>' +(isInvoice?'<p class="erp-print-period">結帳期間：'+erpEscape(invoice.periodFrom||"-")+" ～ "+erpEscape(invoice.periodTo||"-")+'</p>':'')+'<table class="erp-print-table"><thead><tr><th>項次</th><th>品名／規格</th><th>數量</th><th>單價</th><th>小計</th></tr></thead><tbody>'+erpPrintRows(lines)+'</tbody></table><section class="erp-print-bottom"><div class="erp-print-notes"><span>備註</span><p>'+erpEscape(isInvoice?"本單彙整同一客戶本期已確認銷貨單。":order.notes||"")+'</p></div><div class="erp-print-totals"><div><span>未稅金額</span><strong>NT$ '+erpMoney(totals.subtotal)+'</strong></div><div><span>營業稅（5%）</span><strong>NT$ '+erpMoney(totals.taxAmount)+'</strong></div><div class="total"><span>含稅總計</span><strong>NT$ '+erpMoney(totals.totalAmount)+'</strong></div></div></section><footer><span>經手人：'+erpEscape(isInvoice?(invoice.createdByName||""):(order.salesperson||order.createdByName||""))+'</span><span>此為系統列印預覽單據</span></footer></article>';
  document.body.appendChild(overlay);
  document.getElementById("erpClosePrint").addEventListener("click",()=>overlay.remove());
  document.getElementById("erpDoPrint").addEventListener("click",()=>window.print());
}


// ============================================================
// 第三階段：多品項銷貨單、應收帳款與收款銷帳
// 舊單據仍相容：沒有 lines 的資料會自動視為一個品項。
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
function renderErpReceivables(){
 const el=document.getElementById("erp-page-receivables");if(!el)return;const open=erpReceivablesCache.filter(r=>(Number(r.balanceAmount)||0)>0),total=open.reduce((s,r)=>s+(Number(r.balanceAmount)||0),0);
 el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">ACCOUNTS RECEIVABLE</p><h1>應收與收款</h1><p>月結發票建立後，系統自動產生應收款；可記錄部分收款或結清。</p></div></div><div class="erp-metric-grid"><article class="erp-metric"><span>未收應收</span><strong>NT$ '+erpMoney(total)+'</strong><small>'+open.length+' 筆尚未結清</small></article><article class="erp-metric"><span>本期收款</span><strong>NT$ '+erpMoney(erpReceiptsCache.reduce((s,r)=>s+(Number(r.amount)||0),0))+'</strong><small>已記錄收款</small></article><article class="erp-metric"><span>已結清</span><strong>'+erpReceivablesCache.filter(r=>r.status==="paid").length+'</strong><small>張月結發票</small></article></div><section class="erp-panel"><div class="erp-panel-title"><h2>未收應收款</h2><span class="erp-counter">'+open.length+' 筆</span></div>'+(open.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>客戶</th><th>月結發票</th><th>開票日期</th><th>原始金額</th><th>已收</th><th>未收</th><th></th></tr></thead><tbody>'+open.map(r=>'<tr><td>'+erpEscape(r.customerName)+'</td><td><strong>'+erpEscape(r.invoiceNo)+'</strong></td><td>'+erpEscape(r.invoiceDate)+'</td><td>NT$ '+erpMoney(r.originalAmount)+'</td><td>NT$ '+erpMoney(r.receivedAmount)+'</td><td><strong>NT$ '+erpMoney(r.balanceAmount)+'</strong></td><td><button class="erp-primary erp-receipt-btn" data-receivable="'+r.id+'">登錄收款</button></td></tr>').join("")+'</tbody></table></div>':'<div class="erp-empty">目前沒有未收應收款。</div>')+'</section>';
 el.querySelectorAll("[data-receivable]").forEach(b=>b.addEventListener("click",()=>openReceiptForm(b.dataset.receivable)));
}
function openReceiptForm(id){const r=erpReceivablesCache.find(x=>x.id===id);if(!r)return;const n=Number(prompt("請輸入本次收款金額（未收 NT$ "+erpMoney(r.balanceAmount)+"）：",""));if(!Number.isFinite(n)||n<=0)return;if(n>Number(r.balanceAmount))return alert("收款金額不可高於未收金額。");const method=prompt("收款方式（例如：現金、匯款、支票）：","匯款")||"其他";recordErpReceipt(r,n,method);}
async function recordErpReceipt(r,amount,method){const received=(Number(r.receivedAmount)||0)+amount,balance=(Number(r.balanceAmount)||0)-amount,status=balance===0?"paid":"partial",batch=db.batch(),ref=db.collection("erpReceipts").doc();batch.set(ref,{receiptNo:"RC-"+Date.now(),receiptDate:todayStr(),customerId:r.customerId||null,customerName:r.customerName,amount,method,allocations:[{receivableId:r.id,invoiceId:r.invoiceId,amount}],createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});batch.update(db.collection("erpReceivables").doc(r.id),{receivedAmount:received,balanceAmount:balance,status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});try{await batch.commit();}catch(e){console.error(e);alert("收款登錄失敗，請確認 Firebase Rules 已加入應收與收款權限。");}}

async function createErpInvoice(){
  const selected=[...document.querySelectorAll("[data-invoice-sale]:checked")].map(x=>erpSalesOrdersCache.find(o=>o.id===x.dataset.invoiceSale)).filter(Boolean);
  const customerName=erpInvoiceFilter.customerName;
  if(!selected.length)return alert("請至少選擇一筆銷貨單。");
  if(!customerName||selected.some(o=>(o.customerName||"未指定客戶")!==customerName||o.status!=="confirmed"||o.invoiceId))return alert("選取內容已變更，請重新整理後再試。");
  const totals=erpInvoiceTotal(selected);
  if(!confirm("建立月結發票？含稅總計 NT$ "+erpMoney(totals.totalAmount)+"。"))return;
  const invoiceRef=db.collection("erpInvoices").doc(), receivableRef=db.collection("erpReceivables").doc(), invoiceNo=erpInvoiceNumber();
  const customer=erpCustomersCache.find(c=>(c.name||"")===customerName);
  const lines=selected.flatMap(o=>erpOrderLines(o).map(l=>({saleOrderId:o.id,orderNo:o.orderNo,orderDate:o.orderDate,itemName:l.itemName,quantity:Number(l.quantity)||0,unitPrice:Number(l.unitPrice)||0,subtotalAmount:Math.round((Number(l.quantity)||0)*(Number(l.unitPrice)||0))})));
  const invoice={invoiceNo,invoiceDate:todayStr(),customerId:customer?customer.id:null,customerName,periodFrom:erpInvoiceFilter.from,periodTo:erpInvoiceFilter.to,saleOrderIds:selected.map(o=>o.id),lines,subtotalAmount:totals.subtotal,taxAmount:totals.taxAmount,totalAmount:totals.totalAmount,taxRate:.05,status:"issued",createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name};
  const batch=db.batch();batch.set(invoiceRef,invoice);batch.set(receivableRef,{invoiceId:invoiceRef.id,invoiceNo,invoiceDate:invoice.invoiceDate,customerId:invoice.customerId,customerName,originalAmount:totals.totalAmount,receivedAmount:0,balanceAmount:totals.totalAmount,status:"open",createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  selected.forEach(o=>batch.update(db.collection("erpSalesOrders").doc(o.id),{invoiceId:invoiceRef.id,invoiceNo,invoicedAt:firebase.firestore.FieldValue.serverTimestamp()}));
  try{await batch.commit();alert("月結發票與應收帳款已建立。");}catch(e){console.error(e);alert("建立失敗，請確認 Firebase Rules 已加入 erpInvoices 與 erpReceivables 權限。");}
}
