// ERP 共用核心：狀態、導覽、即時資料監聽與儀表板
// ============================================================
// ERP 管理中心
// 範圍：往來對象、銷貨、發票、對帳單、退回折讓、進貨應付、通用帳務。
// 此模組不會扣輪胎或 KYB 庫存。
// ============================================================
// 往來對象主檔：erpParties（取代舊的 erpCustomers），用 type 區分 customer／vendor。
// 監聽器統一由 core.js 的 startPartiesListener() 啟動，庫存端與 ERP 端共用同一份快取，
// 避免兩邊各自監聽又各自覆寫，造成廠商清單偶爾整個消失。

let erpPartiesCache = [];
let erpSalesOrdersCache = [];
let erpListenersStarted = false;
let erpView = "dashboard";
let erpTireTransactionsCache = [];
let erpKybTransactionsCache = [];
let erpTireItemsCache = [];
let erpKybItemsCache = [];
let erpSalesEditingId = null;
let erpInvoicesCache = [];
let erpInvoiceFilter = { customerName:"", from:"", to:"", seriesId:"" };
let erpInvoiceSeriesCache = [];
let erpStatementFilter = { partyName:"", from:"", to:"" };
let erpSalesReturnsCache = [];
let erpReturnFilter = { invoiceId:"" };
let erpPurchasesCache = [];
let erpReceivablesCache = [];
let erpReceiptsCache = [];
let erpLedgerCache = [];
let erpSettlementsCache = [];
let erpInstrumentsCache = [];

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
  if(!userHasAnyRole("accounting")) return;
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
        <button class="erp-nav" data-erp-view="vendors">${ERP_ICONS.customers}<span>廠商管理</span></button>
        <button class="erp-nav" data-erp-view="sales">${ERP_ICONS.sales}<span>銷貨單</span></button>
        <button class="erp-nav" data-erp-view="transfers">${ERP_ICONS.transfer}<span>待建立銷貨單</span></button>
        <button class="erp-nav" data-erp-view="invoices">${ERP_ICONS.sales}<span>發票管理</span></button>
        <button class="erp-nav" data-erp-view="statements">${ERP_ICONS.sales}<span>客戶對帳單</span></button>
        <button class="erp-nav" data-erp-view="returns">${ERP_ICONS.transfer}<span>退回與折讓</span></button>
        <button class="erp-nav" data-erp-view="profitability">${ERP_ICONS.dashboard}<span>成本與毛利</span></button>
        <button class="erp-nav" data-erp-view="purchases">${ERP_ICONS.transfer}<span>進貨單與應付</span></button>
        <button class="erp-nav" data-erp-view="accounting">${ERP_ICONS.customers}<span>帳務與收款</span></button>
        <div class="erp-sidebar-note">帳務基礎<br>通用帳・沖帳・票據</div>
      </aside>
      <main class="erp-main">
        <section class="erp-page" id="erp-page-dashboard"></section>
        <section class="erp-page hidden" id="erp-page-customers"></section>
        <section class="erp-page hidden" id="erp-page-vendors"></section>
        <section class="erp-page hidden" id="erp-page-sales"></section>
        <section class="erp-page hidden" id="erp-page-transfers"></section>
        <section class="erp-page hidden" id="erp-page-invoices"></section>
        <section class="erp-page hidden" id="erp-page-statements"></section>
        <section class="erp-page hidden" id="erp-page-returns"></section>
        <section class="erp-page hidden" id="erp-page-profitability"></section>
        <section class="erp-page hidden" id="erp-page-purchases"></section>
        <section class="erp-page hidden" id="erp-page-accounting"></section>
      </main>
    </div>`;
  document.getElementById("erpWhoLabel").textContent = currentUser.name + "｜" + userRolesLabel(currentUser.roles);
  document.getElementById("erpBackBtn").addEventListener("click", showCategoryScreen);
  app.querySelectorAll("[data-erp-view]").forEach(btn => btn.addEventListener("click", () => showErpView(btn.dataset.erpView)));
  // 使用者離開輸入欄位後，把剛才因為「正在打字」而暫緩的重畫補上。
  app.addEventListener("focusout", ()=>{
    if(!erpRenderPending) return;
    window.setTimeout(()=>{ if(erpRenderPending && !erpViewIsBusy()) renderErpViews(true); }, 200);
  });
}

function showErpView(view){
  erpView = view || "dashboard";
  document.querySelectorAll(".erp-page").forEach(page => page.classList.add("hidden"));
  const active = document.getElementById("erp-page-" + erpView);
  if(active) active.classList.remove("hidden");
  document.querySelectorAll("[data-erp-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.erpView === erpView));
  renderErpViews(true);
}

function startErpListeners(){
  if(erpListenersStarted) return;
  erpListenersStarted = true;
  startPartiesListener();
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
  db.collection("erpInvoiceSeries").onSnapshot(snap => {
    erpInvoiceSeriesCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 發票字軌讀取失敗",err));
  db.collection("erpSalesReturns").onSnapshot(snap => {
    erpSalesReturnsCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 銷貨退回讀取失敗",err));
  db.collection("erpPurchases").onSnapshot(snap => {
    erpPurchasesCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 進貨單讀取失敗",err));
  db.collection("erpReceivables").onSnapshot(snap => {
    erpReceivablesCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 應收帳款讀取失敗",err));
  db.collection("erpReceipts").onSnapshot(snap => {
    erpReceiptsCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 收款讀取失敗",err));
  db.collection("erpLedger").onSnapshot(snap => {
    erpLedgerCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 通用帳務讀取失敗",err));
  db.collection("erpSettlements").onSnapshot(snap => {
    erpSettlementsCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 沖帳資料讀取失敗",err));
  db.collection("erpInstruments").onSnapshot(snap => {
    erpInstrumentsCache=snap.docs.map(d=>({id:d.id,...d.data()})); renderErpViews();
  },err=>console.error("ERP 票據資料讀取失敗",err));
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

// 每個側邊欄頁面對應的繪製函式。以前是任何一個監聽器有動靜就把 11 個頁面全部重畫，
// 會把使用者正在填寫的進貨單／廠商表單整個清掉；現在只重畫目前看到的那一頁。
const ERP_VIEW_RENDERERS = {
  dashboard: () => renderErpDashboard(),
  customers: () => renderErpParties(),
  vendors: () => renderErpVendors(),
  sales: () => renderErpSales(),
  transfers: () => renderErpTransfers(),
  invoices: () => renderErpInvoices(),
  statements: () => renderErpStatements(),
  returns: () => renderErpReturns(),
  profitability: () => renderErpProfitability(),
  purchases: () => renderErpPurchases(),
  accounting: () => renderErpAccounting()
};
let erpRenderPending = false;
// 游標正停在目前頁面的輸入欄位裡時，代表使用者正在打字，這時候不要重畫。
function erpViewIsBusy(){
  const active = document.activeElement;
  if(!active) return false;
  const page = document.getElementById("erp-page-" + erpView);
  if(!page || !page.contains(active)) return false;
  return active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT";
}
function renderErpViews(force){
  const app = document.getElementById("erpApp");
  if(!app || app.classList.contains("hidden")) return;
  if(!force && erpViewIsBusy()){ erpRenderPending = true; return; }
  erpRenderPending = false;
  const render = ERP_VIEW_RENDERERS[erpView];
  if(typeof render === "function") render();
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
      <article class="erp-metric"><span>客戶數</span><strong>${erpPartiesCache.filter(p=>(p.type||"customer")==="customer").length}</strong><small>可供建立銷貨單</small></article>
      <article class="erp-metric"><span>待確認銷貨單</span><strong>${submitted}</strong><small>已送出，尚未確認</small></article>
      <article class="erp-metric"><span>本期已確認</span><strong>${confirmed}</strong><small>尚未扣庫存或入帳</small></article>
    </div>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">RECENT SALES</p><h2>最近銷貨訂單</h2></div><button class="erp-text-btn" data-erp-go="sales">查看全部</button></div>
      ${latest.length ? '<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>單號</th><th>客戶</th><th>日期</th><th>金額</th><th>狀態</th></tr></thead><tbody>' + latest.map(o => '<tr><td><strong>' + erpEscape(o.orderNo) + '</strong></td><td>' + erpEscape(o.customerName || "-") + '</td><td>' + erpDate(o.orderDate) + '</td><td>NT$ ' + erpMoney(o.amount) + '</td><td>' + erpStatus(o.status) + '</td></tr>').join("") + '</tbody></table></div>' : '<div class="erp-empty">尚未建立銷貨訂單。先新增客戶，再建立第一張銷貨單。</div>'}
    </section>`;
  el.querySelectorAll("[data-erp-go]").forEach(btn => btn.addEventListener("click", () => showErpView(btn.dataset.erpGo)));
}
