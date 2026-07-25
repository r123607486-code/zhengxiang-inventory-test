// ============================================================
// 正享有限公司庫存管理系統 — 主程式
// Phase 1：登入分權 / 庫存查詢 / 進銷貨管理(手動輸入) / 儲位管理 / 庫存總表 / 使用者管理
// ============================================================

// 效期反紅：改為由使用者在「庫存總表」頁面點擊選擇門檻年限（1-9年）才會反紅，不再自動顯示。
const DEFAULT_BRANDS = [
  "賽輪Sailun","韓泰Hankook","阿基里斯Achilles","安馳ANCHEE","薩馳輪胎ARDUZZA",
  "黑獅輪胎Blacklion","庫斯通KUSTONE","牛頓輪胎NEUTON","尼克森NEXEN",
  "路德斯通ROAD.STONE","萬峰馳輪胎WINDFORCE","薩提諾ZESTINO"
];

// 小圖示（inline SVG，不需要額外的圖示字型或CDN）
const ICONS = {
  query: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  master:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="9" y1="10" x2="9" y2="20"/></svg>',
  txn:   '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h13l-2-3M21 17H8l2 3"/></svg>',
  loc:   '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  users: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  orders:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M9 12h6M9 16h6M9 8h2"/></svg>',
  myorders:'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  cart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
};

// 分類選擇畫面用的小圖示（輪胎／KYB避震器）
const CATEGORY_ICONS = {
  tire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/><line x1="12" y1="3" x2="12" y2="6.2"/><line x1="12" y1="17.8" x2="12" y2="21"/><line x1="3" y1="12" x2="6.2" y2="12"/><line x1="17.8" y1="12" x2="21" y2="12"/></svg>',
  kyb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="2" x2="12" y2="8"/><rect x="8.5" y="8" width="7" height="10" rx="1.5"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="9" y1="10.5" x2="15" y2="10.5"/><line x1="9" y1="13.5" x2="15" y2="13.5"/></svg>'
};

let currentUser = null; // {uid, name, username, role}
let currentCategory = null; // 'tire' 或 'kyb'（登入後的品項分類選擇）
let itemsCache = [];
let locationsCache = [];
let usersCache = [];
let txnCache = [];
let brandsCache = [];
let ordersCache = [];   // 管理者用：目前所有「待確認」的訂單
let myOrdersCache = []; // 員工用：自己下過的全部訂單（含待確認/已出貨/已取消）

// KYB 避震器模組（獨立品項：不跟輪胎混用，沒有生產批次/效期，但有完整叫貨/訂單/進銷貨流程）
let kybItemsCache = [];
let kybLocationsCache = [];
let kybOrdersCache = [];
let kybMyOrdersCache = [];
let kybTxnCache = [];
let usersListenerStarted = false;
let tireListenersStarted = false;
let kybListenersStarted = false;

// ---------- 工具函式 ----------
function norm(s){ return (s || "").toString().toUpperCase().replace(/\s+/g, ""); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
// 舊版依標準日期(YYYY-MM-DD)算月份，仍保留給「進貨時填的生產日期」使用（如果之後有人改用標準格式填寫）。
function monthsBetween(dateStr){
  if(!dateStr) return null;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(String(dateStr).trim());
  if(!m) return null;
  const year = Number(m[1]);
  if(year < 2015 || year > 2035) return null; // 年份不合理，視為無效日期
  const d = new Date(year, Number(m[2])-1, Number(m[3]));
  if(isNaN(d)) return null;
  const now = new Date();
  return (now.getFullYear()-d.getFullYear())*12 + (now.getMonth()-d.getMonth());
}

// 輪胎業界標準的 DOT 製造代碼：4碼數字，前2碼＝第幾週，後2碼＝西元年後兩碼。
// 例如「2523」＝2023年第25週（約2023/6/19-6/25）。
// 回傳「距今幾個月」，無法辨識則回傳 null（例如舊資料裡的「826」「4024/125」這類非標準代碼）。
function isoWeekToDate(year, week){
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7; // 週一=0
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
}
function tireCodeMonthsAgo(code){
  if(!code) return null;
  const m = /^(\d{2})(\d{2})$/.exec(String(code).trim());
  if(!m) return null;
  const week = Number(m[1]);
  const yy = Number(m[2]);
  if(week < 1 || week > 53) return null;
  const year = 2000 + yy; // 假設都是西元2000年後生產
  if(year < 2015 || year > 2035) return null; // 年份不合理，視為無效代碼
  const d = isoWeekToDate(year, week);
  if(isNaN(d)) return null;
  const now = new Date();
  return (now.getFullYear() - d.getUTCFullYear()) * 12 + (now.getMonth() - d.getUTCMonth());
}
// 儲位資料格式：{ 儲位代碼: [ {qty, productionDate}, ... ] }——每個儲位底下可以有「好幾批」不同生產日期的庫存，
// 因為同一個儲位常常會混到不同批次進貨的貨。
// 為了相容舊資料（早期是純數字、或單一 {qty, productionDate} 物件），一律透過 normalizeBatches() 讀取，
// 不要直接讀 item.locations[code]，避免遇到舊格式就壞掉。
function normalizeBatches(raw, item){
  if(raw == null) return [];
  if(Array.isArray(raw)) return raw.map(b=>({ qty: Number(b&&b.qty)||0, productionDate: (b&&b.productionDate) || null }));
  if(typeof raw === "object") return [{ qty: Number(raw.qty)||0, productionDate: raw.productionDate || (item && item.productionDate) || null }];
  return [{ qty: Number(raw)||0, productionDate: (item && item.productionDate) || null }];
}
// 這個儲位「全部批次加起來」的總庫存（不分批次），舊的呼叫方式繼續可用
function locQty(loc){
  if(loc == null) return 0;
  if(Array.isArray(loc)) return loc.reduce((a,b)=>a+(Number(b&&b.qty)||0), 0);
  if(typeof loc === "object") return Number(loc.qty)||0;
  return Number(loc)||0;
}
function totalQty(item){
  const locs = item.locations || {};
  return Object.values(locs).reduce((a,b)=>a+locQty(b), 0);
}
// 「待入庫」是一個特殊儲位代碼（內勤剛進貨、還沒搬到正式儲位前暫放的地方）。
// 只要品項在這個儲位有庫存，這一整列就要排到所有清單的最上面，並用特殊顏色標記。
const PENDING_STOCK_CODE = "待入庫";
function hasPendingStock(item){
  return locQty((item.locations||{})[PENDING_STOCK_CODE]) > 0;
}
// 回傳這個品項底下每一批（每個儲位×每個生產日期）的明細：[{code, idx, qty, date}]，idx是這一批在該儲位陣列裡的位置
// 依儲位代碼、生產日期排序；同一個儲位如果有兩批不同生產日期，會各自變成獨立一行，不會混在一起
function locDetailList(item){
  const locs = item.locations || {};
  const rows = [];
  Object.keys(locs).forEach(code=>{
    normalizeBatches(locs[code], item).forEach((b, idx)=>{
      if(b.qty > 0) rows.push({ code, idx, qty: b.qty, date: b.productionDate });
    });
  });
  rows.sort((a,b)=> a.code.localeCompare(b.code, "zh-Hant") || (a.date||"").localeCompare(b.date||""));
  return rows;
}
function locSummary(item){
  const list = locDetailList(item);
  return list.map(l=> `${l.code}×${l.qty}${l.date?`(${l.date})`:""}`).join("、") || "-";
}
function escapeHtml(s){
  return (s==null?"":s.toString()).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- KYB 避震器模組專用的工具函式 ----------
// KYB 不需要生產批次／效期，所以儲位資料就是單純的「儲位代碼: 數量」，不用像輪胎那樣包一層批次陣列。
function kybLocQty(loc){ return Number(loc)||0; }
function kybTotalQty(item){
  const locs = item.locations || {};
  return Object.values(locs).reduce((a,b)=>a+kybLocQty(b), 0);
}
function kybLocList(item){
  const locs = item.locations || {};
  const rows = Object.keys(locs).map(code=>({code, qty:kybLocQty(locs[code])})).filter(r=>r.qty>0);
  rows.sort((a,b)=> a.code.localeCompare(b.code, "zh-Hant"));
  return rows;
}
function kybLocSummary(item){
  const list = kybLocList(item);
  return list.map(l=>`${l.code}×${l.qty}`).join("、") || "-";
}

// ---------- 登入 ----------
document.getElementById("loginBtn").addEventListener("click", doLogin);
document.getElementById("loginPassword").addEventListener("keydown", e=>{ if(e.key==="Enter") doLogin(); });

function doLogin(){
  const uname = document.getElementById("loginUsername").value.trim();
  const pw = document.getElementById("loginPassword").value;
  const errEl = document.getElementById("loginErr");
  errEl.textContent = "";
  if(!uname || !pw){ errEl.textContent = "請輸入帳號與密碼"; return; }
  const email = uname + "@" + INTERNAL_EMAIL_DOMAIN;
  auth.signInWithEmailAndPassword(email, pw)
    .catch(()=>{ errEl.textContent = "帳號或密碼錯誤"; });
}

document.getElementById("logoutBtn").addEventListener("click", ()=> auth.signOut());

auth.onAuthStateChanged(async (user)=>{
  if(!user){
    document.getElementById("splash").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
    currentUser = null;
    return;
  }
  const doc = await db.collection("users").doc(user.uid).get();
  if(!doc.exists || doc.data().active === false){
    document.getElementById("loginErr").textContent = "此帳號已被停用，請聯絡管理者";
    auth.signOut();
    return;
  }
  const data = doc.data();
  currentUser = { uid: user.uid, name: data.name, username: data.username, role: data.role };
  document.getElementById("splash").classList.add("hidden");
  document.getElementById("whoLabel").textContent = `${currentUser.name}（${currentUser.role==='admin'?'管理者':'員工'}）`;
  showCategoryScreen();
});

// ---------- 登入後的品項分類選擇畫面（輪胎／KYB避震器） ----------
document.getElementById("categoryIconTire").innerHTML = CATEGORY_ICONS.tire;
document.getElementById("categoryIconKyb").innerHTML = CATEGORY_ICONS.kyb;

function showCategoryScreen(){
  document.getElementById("app").classList.add("hidden");
  document.getElementById("categoryScreen").classList.remove("hidden");
}

document.querySelectorAll(".category-card").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    currentCategory = btn.dataset.category; // 'tire' 或 'kyb'
    document.getElementById("categoryScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    document.getElementById("appTitle").textContent =
      "正享庫存管理系統｜" + (currentCategory === "kyb" ? "KYB避震器" : "輪胎");
    buildTabs();
    checkFridayBanner();
    startListeners();
  });
});

document.getElementById("switchCategoryBtn").addEventListener("click", ()=>{
  showCategoryScreen();
});

// ---------- 分頁(Tabs) ----------
const TIRE_TAB_DEFS = [
  {id:"query",    label:"庫存查詢", icon:ICONS.query,   roles:["admin","member"]},
  {id:"myorders", label:"我的訂單", icon:ICONS.myorders,roles:["member"]},
  {id:"master",   label:"庫存總表", icon:ICONS.master,  roles:["admin","member"]},
  {id:"txn",      label:"進銷貨管理", icon:ICONS.txn,   roles:["admin"]},
  {id:"orders",   label:"訂單管理", icon:ICONS.orders,  roles:["admin"]},
  {id:"loc",      label:"儲位管理", icon:ICONS.loc,     roles:["admin"]},
  {id:"import",   label:"資料匯入", icon:ICONS.txn,     roles:["admin"]},
  {id:"users",    label:"使用者管理", icon:ICONS.users, roles:["admin"]},
];
const KYB_TAB_DEFS = [
  {id:"kyb-query",    label:"庫存查詢", icon:ICONS.query,   roles:["admin","member"]},
  {id:"kyb-myorders", label:"我的訂單", icon:ICONS.myorders,roles:["member"]},
  {id:"kyb-master",   label:"庫存總表", icon:ICONS.master,  roles:["admin","member"]},
  {id:"kyb-txn",      label:"進銷貨管理", icon:ICONS.txn,   roles:["admin"]},
  {id:"kyb-orders",   label:"訂單管理", icon:ICONS.orders,  roles:["admin"]},
  {id:"kyb-loc",      label:"儲位管理", icon:ICONS.loc,     roles:["admin"]},
  {id:"kyb-import",   label:"資料匯入", icon:ICONS.txn,     roles:["admin"]},
  {id:"users",        label:"使用者管理", icon:ICONS.users, roles:["admin"]},
];
function currentTabDefs(){ return currentCategory === "kyb" ? KYB_TAB_DEFS : TIRE_TAB_DEFS; }

function buildTabs(){
  const nav = document.getElementById("tabs");
  const visible = currentTabDefs().filter(t=>t.roles.includes(currentUser.role));
  nav.innerHTML = visible.map((t,i)=>
    `<button data-tab="${t.id}" class="${i===0?'active':''}">${t.icon}${t.label}${t.id==='orders'?'<span class="badge-dot hidden" id="ordersTabBadge">0</span>':''}${t.id==='kyb-orders'?'<span class="badge-dot hidden" id="kybOrdersTabBadge">0</span>':''}</button>`
  ).join("");
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
  document.getElementById("page-"+visible[0].id).classList.add("active");
  nav.querySelectorAll("button").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      nav.querySelectorAll("button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
      document.getElementById("page-"+btn.dataset.tab).classList.add("active");
      updateStickyOffsets();
    });
  });
  updateStickyOffsets();
}

// ---------- 讓「搜尋/篩選區塊」固定在頂部 ----------
// header跟nav分頁的實際高度會因為手機螢幕寬度、文字長度而變動（例如標題太長換行），
// 所以用JS量測實際高度，動態設定CSS變數，而不是寫死一個固定數字。
function updateStickyOffsets(){
  const headerEl = document.querySelector("header.topbar");
  const navEl = document.getElementById("tabs");
  if(!headerEl || !navEl) return;
  document.documentElement.style.setProperty("--header-h", headerEl.offsetHeight + "px");
  document.documentElement.style.setProperty("--nav-h", navEl.offsetHeight + "px");
}
window.addEventListener("resize", updateStickyOffsets);
window.addEventListener("load", ()=> setTimeout(updateStickyOffsets, 100));

// ---------- 週五備份提醒 ----------
function checkFridayBanner(){
  if(currentUser.role !== "admin") return;
  const isFriday = new Date().getDay() === 5;
  const dismissedKey = "backupBannerDismissed_" + todayStr();
  if(isFriday && !sessionStorage.getItem(dismissedKey)){
    document.getElementById("backupBanner").classList.remove("hidden");
  }
}
document.getElementById("dismissBanner").addEventListener("click", ()=>{
  document.getElementById("backupBanner").classList.add("hidden");
  sessionStorage.setItem("backupBannerDismissed_" + todayStr(), "1");
});

// ---------- 即時資料監聽 ----------
// 進到某個分類時才訂閱該分類的資料（輪胎／KYB各自獨立），使用者管理則不分類、只訂閱一次。
function startListeners(){
  if(!usersListenerStarted && currentUser.role === "admin"){
    usersListenerStarted = true;
    db.collection("users").onSnapshot(snap=>{
      usersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderUsers();
    });
  }
  if(currentCategory === "kyb"){
    if(!kybListenersStarted){ kybListenersStarted = true; startKybListeners(); }
  } else {
    if(!tireListenersStarted){ tireListenersStarted = true; startTireListeners(); }
  }
}

function startTireListeners(){
  db.collection("items").onSnapshot(snap=>{
    itemsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderQuery(); renderMaster();
  });
  db.collection("locations").onSnapshot(snap=>{
    locationsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderLocations();
  });
  if(currentUser.role === "admin"){
    db.collection("transactions").orderBy("date","desc").limit(200).onSnapshot(snap=>{
      txnCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderTxns();
    });
    db.collection("orders").where("status","==","pending").onSnapshot(snap=>{
      ordersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderOrders();
      updateOrdersBadge();
    });
  } else {
    db.collection("orders").where("requestedByUid","==",currentUser.uid).onSnapshot(snap=>{
      myOrdersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderMyOrders();
    });
  }
  db.collection("brands").onSnapshot(snap=>{
    brandsCache = snap.docs.map(d=>d.data().name);
    if(brandsCache.length === 0) brandsCache = DEFAULT_BRANDS.slice();
  }, ()=>{ brandsCache = DEFAULT_BRANDS.slice(); });
}

function startKybListeners(){
  db.collection("kybItems").onSnapshot(snap=>{
    kybItemsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderKybQuery(); renderKybMaster();
  });
  db.collection("kybLocations").onSnapshot(snap=>{
    kybLocationsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderKybLocations();
  });
  if(currentUser.role === "admin"){
    db.collection("kybTransactions").orderBy("date","desc").limit(200).onSnapshot(snap=>{
      kybTxnCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderKybTxns();
    });
    db.collection("kybOrders").where("status","==","pending").onSnapshot(snap=>{
      kybOrdersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderKybOrders();
      updateKybOrdersBadge();
    });
  } else {
    db.collection("kybOrders").where("requestedByUid","==",currentUser.uid).onSnapshot(snap=>{
      kybMyOrdersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderKybMyOrders();
    });
  }
}

// 有新訂單待確認時，讓管理者不管在哪一頁都能馬上看到（畫面上方橫幅 + 分頁按鈕上的紅點數字）
function updateOrdersBadge(){
  const badge = document.getElementById("ordersTabBadge");
  const banner = document.getElementById("ordersBanner");
  const bannerText = document.getElementById("ordersBannerText");
  const n = ordersCache.length;
  if(badge){ badge.textContent = n; badge.classList.toggle("hidden", n===0); }
  if(banner && bannerText){
    if(n > 0){ bannerText.textContent = `有 ${n} 筆新訂單待確認`; banner.classList.remove("hidden"); }
    else banner.classList.add("hidden");
  }
}
document.getElementById("dismissOrdersBanner").addEventListener("click", ()=>{
  const tabId = currentCategory === "kyb" ? "kyb-orders" : "orders";
  const btn = document.querySelector(`nav.tabs button[data-tab="${tabId}"]`);
  if(btn) btn.click();
});

function updateKybOrdersBadge(){
  const badge = document.getElementById("kybOrdersTabBadge");
  const banner = document.getElementById("ordersBanner");
  const bannerText = document.getElementById("ordersBannerText");
  const n = kybOrdersCache.length;
  if(badge){ badge.textContent = n; badge.classList.toggle("hidden", n===0); }
  // 訂單橫幅是共用元件，只有目前正在看KYB分類時才用KYB的數字覆蓋顯示
  if(currentCategory === "kyb" && banner && bannerText){
    if(n > 0){ bannerText.textContent = `有 ${n} 筆新訂單待確認`; banner.classList.remove("hidden"); }
    else banner.classList.add("hidden");
  }
}

// ============================================================
// 庫存查詢
// ============================================================
document.getElementById("queryBox").addEventListener("input", renderQuery);

function renderQuery(){
  const box = document.getElementById("queryResults");
  const countEl = document.getElementById("queryCount");
  const q = norm(document.getElementById("queryBox").value);

  // 顯示邏輯：全部品項都顯示（含0庫存）；排序優先度：待入庫有貨 > 一般有庫存 > 0庫存
  let list = itemsCache.slice();
  if(q) list = list.filter(it=> norm(it.spec).includes(q) || norm(it.model).includes(q) || norm(it.brand).includes(q));
  const sortRank = (it)=> hasPendingStock(it) ? 0 : (totalQty(it)>0 ? 1 : 2);
  list.sort((a,b)=> sortRank(a) - sortRank(b));

  const inStockCount = list.filter(it=>totalQty(it)>0).length;
  countEl.textContent = q ? `找到 ${list.length} 筆（有庫存 ${inStockCount} 筆）` : `共 ${list.length} 筆品項（有庫存 ${inStockCount} 筆）`;

  box.innerHTML = list.slice(0,200).map(it=>{
    const qty = totalQty(it);
    const noStock = qty <= 0;
    const pending = hasPendingStock(it);
    return `<div class="card${noStock?' card-nostock':''}${pending?' card-pending':''}">
      <div class="code-row">
        <div class="code">${escapeHtml(it.spec)}${pending?'<span class="pending-tag">待入庫</span>':''}</div>
        ${noStock ? '' : `<button class="order-btn" data-id="${it.id}">${ICONS.cart}叫貨</button>`}
      </div>
      <div class="sub">${escapeHtml(it.brand)}　${escapeHtml(it.model||"")}</div>
      <div class="qty">庫存 ${qty}${it.twenty!=null?`　　20% ${it.twenty}`:""}${it.sellPrice!=null?`　　售價 ${it.sellPrice}`:""}</div>
      <div class="sub">儲位：${escapeHtml(locSummary(it))}</div>
    </div>`;
  }).join("") || `<div class="empty">查無符合的品項</div>`;

  box.querySelectorAll(".order-btn").forEach(b=>{
    b.addEventListener("click", ()=> openOrderModal(b.dataset.id));
  });
}

// 員工在庫存查詢頁點「叫貨」：填數量、客戶資訊，送出後只建立一筆「待確認」訂單，不會馬上扣庫存
function openOrderModal(itemId){
  const item = itemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const options = locDetailList(item);
  const totalAvail = totalQty(item);
  const html = `
    <div class="sheet-head"><h2>叫貨：${escapeHtml(item.spec)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>品牌／型號</label><input type="text" value="${escapeHtml(item.brand)} ${escapeHtml(item.model||'')}" disabled></div>
    <div class="form-row"><label>目前總庫存</label><input type="text" value="${totalAvail}" disabled></div>
    <div class="form-row"><label>選擇儲位／批次</label>
      <select id="orderLoc">${options.length ? options.map((o,i)=>`<option value="${i}">${escapeHtml(o.code)}${o.date?`（${escapeHtml(o.date)}）`:''}（目前${o.qty}）</option>`).join("") : `<option value="">目前無庫存</option>`}</select>
    </div>
    <div class="form-row"><label>數量</label>
      <select id="orderQty"></select>
    </div>
    <div class="form-row"><label>客戶姓名</label><input type="text" id="orderCustomerName"></div>
    <div class="form-row"><label>聯絡方式</label><input type="text" id="orderCustomerContact"></div>
    <div class="form-row"><label>備註</label><input type="text" id="orderCustomerNote"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="orderSubmitBtn">送出叫貨</button>
    </div>`;
  openModal(html);

  function refreshQtyOptions(){
    const idx = Number(document.getElementById("orderLoc").value);
    const opt = options[idx];
    const qtySelect = document.getElementById("orderQty");
    if(!opt){ qtySelect.innerHTML = `<option value="0">目前無庫存</option>`; return; }
    qtySelect.innerHTML = Array.from({length:opt.qty},(_,i)=>i+1).map(n=>`<option value="${n}">${n}</option>`).join("");
  }
  const locSelect = document.getElementById("orderLoc");
  if(options.length) locSelect.addEventListener("change", refreshQtyOptions);
  refreshQtyOptions();

  document.getElementById("orderSubmitBtn").addEventListener("click", async ()=>{
    const idx = Number(document.getElementById("orderLoc").value);
    const opt = options[idx];
    const qty = Number(document.getElementById("orderQty").value);
    const customerName = document.getElementById("orderCustomerName").value.trim();
    const customerContact = document.getElementById("orderCustomerContact").value.trim();
    const customerNote = document.getElementById("orderCustomerNote").value.trim();
    if(!opt){ alert("這個品項目前沒有庫存可以叫貨"); return; }
    if(!qty || qty<=0){ alert("請輸入正確的數量"); return; }
    if(qty > opt.qty){ alert(`這一批目前只有 ${opt.qty}，不能叫超過這個數量`); return; }
    if(!customerName){ alert("請輸入客戶姓名"); return; }
    try{
      await db.collection("orders").add({
        itemId: item.id,
        itemLabel: `${item.brand} ${item.spec}（${item.model||""}）`,
        qty, loc: opt.code, batchDate: opt.date || null,
        customerName, customerContact, customerNote,
        requestedByUid: currentUser.uid, requestedByName: currentUser.name,
        status: "pending", requestedAt: new Date().toISOString()
      });
      closeModal();
      alert("已送出，等待管理者確認出貨。");
    }catch(e){
      alert("送出失敗："+e.message);
    }
  });
}

// ============================================================
// 庫存總表
// ============================================================
let masterExpireYears = null; // null=未套用反紅；1-9=套用中的門檻年限
document.getElementById("masterBox").addEventListener("input", renderMaster);
document.getElementById("applyExpireBtn").addEventListener("click", ()=>{
  masterExpireYears = Number(document.getElementById("expireYearsSelect").value);
  renderMaster();
});
document.getElementById("clearExpireBtn").addEventListener("click", ()=>{
  masterExpireYears = null;
  renderMaster();
});

function renderMaster(){
  const q = norm(document.getElementById("masterBox").value);

  let list = itemsCache.slice(); // 總表：全部品項，含0庫存
  if(q) list = list.filter(it=> norm(it.spec).includes(q) || norm(it.model).includes(q) || norm(it.brand).includes(q));
  list.sort((a,b)=> (hasPendingStock(b)?1:0) - (hasPendingStock(a)?1:0));

  document.getElementById("masterCount").textContent = `共 ${list.length} 筆`
    + (masterExpireYears ? `　（反紅門檻：超過 ${masterExpireYears} 年）` : "");

  const body = document.getElementById("masterBody");
  body.innerHTML = list.map(it=>{
    // 反紅邏輯：只要某個儲位的生產日期能被解析成合法的4碼DOT代碼（週+年），就直接拿來判斷；
    // 無法解析（像「926」這種3碼、或格式不對的舊年分代碼）一律當作「無法判定」，不會反紅、不會用猜的。
    const details = locDetailList(it).map(d=>{
      let expired = false;
      if(masterExpireYears){
        const m = tireCodeMonthsAgo(d.date);
        expired = m !== null && m > masterExpireYears * 12;
      }
      return {...d, expired};
    });
    const rowExpired = details.some(d=>d.expired);
    const pending = hasPendingStock(it);
    const locHtml = details.length
      ? details.map(d=>`<div class="loc-line${d.expired?' loc-expired':''}${d.code===PENDING_STOCK_CODE?' loc-pending':''}" data-id="${it.id}" data-code="${escapeHtml(d.code)}" data-idx="${d.idx}">${escapeHtml(d.code)}：${d.qty}${d.date?`（${escapeHtml(d.date)}）`:''}</div>`).join("")
      : `<span class="empty-inline">無庫存</span>`;
    return `<tr class="${rowExpired?'expire':''} ${pending?'row-pending':''}">
      <td>${escapeHtml(it.brand)}</td>
      <td>${escapeHtml(it.model||"")}${pending?'<span class="pending-tag">待入庫</span>':''}</td>
      <td>${escapeHtml(it.spec)}</td>
      <td>${totalQty(it)}</td>
      <td class="loc-detail-cell">${locHtml}</td>
      <td class="twenty-cell${currentUser.role==='admin'?' editable-cell':''}" data-id="${it.id}">${it.twenty!=null?it.twenty:"未填"}</td>
      <td class="price-cell${currentUser.role==='admin'?' editable-cell':''}" data-id="${it.id}">${it.sellPrice!=null?it.sellPrice:"未填"}</td>
      <td>${escapeHtml(it.remark||"")}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="empty">尚無資料</td></tr>`;

  body.querySelectorAll(".loc-line").forEach(el=>{
    el.addEventListener("click", ()=> openLocationModal(el.dataset.id, el.dataset.code, Number(el.dataset.idx)));
  });
  if(currentUser.role === "admin"){
    body.querySelectorAll(".twenty-cell").forEach(td=>{
      td.addEventListener("click", ()=> editTwenty(td.dataset.id));
    });
    body.querySelectorAll(".price-cell").forEach(td=>{
      td.addEventListener("click", ()=> editSellPrice(td.dataset.id));
    });
  }

  window._masterFilteredList = list;
}

// 點擊某一批儲位明細，開啟「編輯生產日期／搬到其他儲位／拆成不同批次」視窗
function openLocationModal(itemId, code, idx){
  const item = itemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const allLocs = item.locations || {};
  const batches = normalizeBatches(allLocs[code], item);
  const batch = batches[idx];
  if(!batch) return;
  const qty = batch.qty;
  const date = batch.productionDate || "";
  const allCodes = locationsCache.map(l=>l.code);

  const html = `
    <div class="sheet-head"><h2>儲位管理：${escapeHtml(code)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>目前儲位</label><input type="text" value="${escapeHtml(code)}" disabled></div>
    <div class="form-row"><label>這一批目前庫存</label><input type="text" value="${qty}" disabled></div>
    <div class="form-row"><label>這一批生產日期（4碼DOT代碼，例如2523；留空表示未填）</label><input type="text" id="locEditDate" value="${escapeHtml(date)}"></div>
    <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
    <div class="form-row"><label>搬出／拆出數量（不搬就留空）</label><input type="number" id="locMoveQty" min="1" max="${qty}"></div>
    <div class="form-row"><label>搬到哪個儲位（可選本儲位，代表拆成不同生產日期的另一批；只能選現有儲位）</label>
      <select id="locMoveTarget"><option value="">請選擇</option>${allCodes.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}${c===code?'（本儲位，拆成新批次）':''}</option>`).join("")}</select>
    </div>
    <div class="form-row"><label>拆出去那批的生產日期（留空表示跟上面這批一樣）</label><input type="text" id="locMoveBatchDate" placeholder="例如 1626"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="locSaveBtn">儲存</button>
    </div>`;
  openModal(html);

  document.getElementById("locSaveBtn").addEventListener("click", ()=>{
    const newDate = document.getElementById("locEditDate").value.trim();
    const moveQtyRaw = document.getElementById("locMoveQty").value;
    const moveTarget = document.getElementById("locMoveTarget").value;
    const moveBatchDateRaw = document.getElementById("locMoveBatchDate").value.trim();
    const moveQty = moveQtyRaw ? Number(moveQtyRaw) : 0;

    if(moveQty > 0 && !moveTarget){ alert("請選擇要搬到哪個儲位"); return; }
    if(moveQty > qty){ alert("搬出數量不能超過這一批目前的庫存"); return; }

    const newLocs = {...allLocs};
    let srcBatches = normalizeBatches(allLocs[code], item).map(b=>({...b}));
    const remaining = qty - moveQty;
    if(remaining <= 0) srcBatches.splice(idx, 1);
    else srcBatches[idx] = { qty: remaining, productionDate: newDate || null };

    if(moveQty > 0){
      const destDate = moveBatchDateRaw || (newDate || null);
      if(moveTarget === code){
        // 拆到同一個儲位：如果目的批次生產日期剛好跟現有某一批一樣就合併，否則新增一批
        const existingIdx = srcBatches.findIndex(b=> (b.productionDate||null) === (destDate||null));
        if(existingIdx>=0) srcBatches[existingIdx] = { qty: srcBatches[existingIdx].qty + moveQty, productionDate: destDate||null };
        else srcBatches.push({ qty: moveQty, productionDate: destDate||null });
        newLocs[code] = srcBatches.filter(b=>b.qty>0);
      } else {
        newLocs[code] = srcBatches.filter(b=>b.qty>0);
        let destBatches = normalizeBatches(allLocs[moveTarget], item).map(b=>({...b}));
        const existingIdx = destBatches.findIndex(b=> (b.productionDate||null) === (destDate||null));
        if(existingIdx>=0) destBatches[existingIdx] = { qty: destBatches[existingIdx].qty + moveQty, productionDate: destDate||null };
        else destBatches.push({ qty: moveQty, productionDate: destDate||null });
        newLocs[moveTarget] = destBatches.filter(b=>b.qty>0);
      }
    } else {
      newLocs[code] = srcBatches.filter(b=>b.qty>0);
    }

    if(newLocs[code] && newLocs[code].length===0) delete newLocs[code];
    if(moveTarget && newLocs[moveTarget] && newLocs[moveTarget].length===0) delete newLocs[moveTarget];

    db.collection("items").doc(itemId).update({ locations: newLocs })
      .then(()=>closeModal())
      .catch(e=>alert("更新失敗："+e.message));
  });
}

function editTwenty(itemId){
  if(currentUser.role !== "admin") return;
  const item = itemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const cur = item.twenty!=null ? String(item.twenty) : "";
  const input = prompt("輸入20%金額（純數字）", cur);
  if(input === null) return;
  const val = input.trim();
  if(val === ""){
    db.collection("items").doc(itemId).update({ twenty: null }).catch(e=>alert("更新失敗："+e.message));
    return;
  }
  const num = Number(val);
  if(isNaN(num)){ alert("請輸入數字"); return; }
  db.collection("items").doc(itemId).update({ twenty: num }).catch(e=>alert("更新失敗："+e.message));
}

function editSellPrice(itemId){
  if(currentUser.role !== "admin") return;
  const item = itemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const cur = item.sellPrice!=null ? String(item.sellPrice) : "";
  const input = prompt("輸入售價金額（純數字）", cur);
  if(input === null) return;
  const val = input.trim();
  if(val === ""){
    db.collection("items").doc(itemId).update({ sellPrice: null }).catch(e=>alert("更新失敗："+e.message));
    return;
  }
  const num = Number(val);
  if(isNaN(num)){ alert("請輸入數字"); return; }
  db.collection("items").doc(itemId).update({ sellPrice: num }).catch(e=>alert("更新失敗："+e.message));
}

document.getElementById("exportFilteredBtn").addEventListener("click", ()=>{
  exportItemsToExcel(window._masterFilteredList || [], "庫存總表_篩選結果");
});
document.getElementById("exportAllBtn").addEventListener("click", ()=>{
  exportFullBackup();
});

function exportItemsToExcel(list, filename){
  const rows = list.map(it=>({
    品牌: it.brand, 型號: it.model, 規格: it.spec, 總量: totalQty(it),
    儲位分布: locSummary(it), "20%": it.twenty!=null?it.twenty:"", 售價: it.sellPrice!=null?it.sellPrice:"", 備註: it.remark||""
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "資料");
  XLSX.writeFile(wb, `${filename}_${todayStr()}.xlsx`);
}

async function exportFullBackup(){
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsCache.map(it=>({
    id:it.id, 品牌:it.brand, 型號:it.model, 規格:it.spec, 總量:totalQty(it),
    儲位分布:locSummary(it), "20%":it.twenty!=null?it.twenty:"", 售價:it.sellPrice!=null?it.sellPrice:"", 備註:it.remark||""
  }))), "品項主檔");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locationsCache.map(l=>({儲位代碼:l.code}))), "儲位主檔");
  const txnSnap = await db.collection("transactions").get();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnSnap.docs.map(d=>d.data())), "進出貨紀錄");
  XLSX.writeFile(wb, `完整備份_${todayStr()}.xlsx`);
}

// ============================================================
// 進銷貨管理
// ============================================================
document.getElementById("newTxnBtn").addEventListener("click", openTxnModal);
document.getElementById("newItemBtn").addEventListener("click", openNewItemModal);

document.getElementById("txnFilterFrom").addEventListener("change", renderTxns);
document.getElementById("txnFilterTo").addEventListener("change", renderTxns);
document.getElementById("txnFilterSalesperson").addEventListener("input", renderTxns);
document.getElementById("txnFilterCustomer").addEventListener("input", renderTxns);
document.getElementById("txnFilterClearBtn").addEventListener("click", ()=>{
  document.getElementById("txnFilterFrom").value = "";
  document.getElementById("txnFilterTo").value = "";
  document.getElementById("txnFilterSalesperson").value = "";
  document.getElementById("txnFilterCustomer").value = "";
  renderTxns();
});

function renderTxns(){
  const body = document.getElementById("txnBody");
  const from = document.getElementById("txnFilterFrom").value;
  const to = document.getElementById("txnFilterTo").value;
  const salesQ = norm(document.getElementById("txnFilterSalesperson").value);
  const custQ = norm(document.getElementById("txnFilterCustomer").value);

  let list = txnCache.slice();
  if(from) list = list.filter(t=> t.date >= from);
  if(to) list = list.filter(t=> t.date <= to);
  if(salesQ) list = list.filter(t=> norm(t.salesperson || t.operator || "").includes(salesQ));
  if(custQ) list = list.filter(t=> norm(t.customerName || "").includes(custQ));

  document.getElementById("txnCount").textContent = `共 ${list.length} 筆`;
  body.innerHTML = list.map(t=>{
    const item = itemsCache.find(i=>i.id===t.itemId);
    const label = item ? `${item.brand} ${item.spec}` : "(品項已刪除)";
    return `<tr>
      <td>${escapeHtml(t.date)}</td>
      <td>${t.type==='in'?'進貨':'銷貨'}</td>
      <td>${escapeHtml(label)}</td>
      <td>${t.qty}</td>
      <td>${escapeHtml(t.salesperson||"")}</td>
      <td>${escapeHtml(t.customerName||"")}</td>
      <td>${escapeHtml(t.operator||"")}</td>
      <td><button data-edit="${t.id}">編輯</button> <button data-del="${t.id}">刪除</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="empty">尚無紀錄</td></tr>`;

  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=>editTxn(b.dataset.edit)));
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=>deleteTxn(b.dataset.del)));
}

function openTxnModal(){
  const html = `
    <div class="sheet-head"><h2>新增進貨／銷貨</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>類型</label>
      <select id="txnType"><option value="in">進貨</option><option value="out">銷貨</option></select>
    </div>
    <div class="form-row">
      <label>搜尋品項（輸入規格或型號）</label>
      <input type="text" id="txnItemSearch" placeholder="例如 205/60">
      <div class="autocomplete-list hidden" id="txnItemList"></div>
    </div>
    <div class="form-row"><label>已選品項</label><input type="text" id="txnItemLabel" disabled></div>
    <div class="form-row"><label>數量</label><input type="number" id="txnQty" min="1"></div>
    <div class="form-row"><label>儲位</label>
      <select id="txnLoc"><option value="">請先選擇品項</option></select>
    </div>
    <div class="form-row" id="txnProdDateRow"><label>生產日期（選填，這批的4碼DOT代碼，例如2523；只有進貨才需要）</label><input type="text" id="txnProdDate" placeholder="例如 2523"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="txnSubmitBtn">確認送出</button>
    </div>`;
  openModal(html);
  let selectedItemId = null;

  function refreshLocOptions(){
    const type = document.getElementById("txnType").value;
    const locSelect = document.getElementById("txnLoc");
    const it = itemsCache.find(i=>i.id===selectedItemId);
    // 銷貨不用管生產日期，只有進貨才需要填（是設定/更新該儲位生產日期的地方）
    const prodDateRow = document.getElementById("txnProdDateRow");
    if(type === "out"){
      prodDateRow.classList.add("hidden");
      document.getElementById("txnProdDate").value = "";
    } else {
      prodDateRow.classList.remove("hidden");
    }
    if(!it){ locSelect.innerHTML = `<option value="">請先選擇品項</option>`; window._txnOutOptions = []; return; }
    if(type === "out"){
      // 銷貨：把「每個儲位×每一批不同生產日期」都列成獨立選項，選哪個就是從哪個儲位、哪一批扣庫存，
      // 這樣同一個儲位如果混了不同生產日期的批次，才不會扣錯批次、算錯效期。
      const options = locDetailList(it);
      window._txnOutOptions = options;
      if(options.length === 0){
        locSelect.innerHTML = `<option value="">這個品項目前沒有庫存可以出貨</option>`;
      } else {
        locSelect.innerHTML = options.map((o,i)=>`<option value="${i}">${escapeHtml(o.code)}${o.date?`（${escapeHtml(o.date)}）`:''}（目前${o.qty}）</option>`).join("");
      }
    } else {
      window._txnOutOptions = [];
      // 進貨：可以選任何儲位（含新品項可能要放的新儲位）
      locSelect.innerHTML = locationsCache.map(l=>`<option value="${escapeHtml(l.code)}">${escapeHtml(l.code)}</option>`).join("");
    }
  }

  document.getElementById("txnType").addEventListener("change", refreshLocOptions);

  const searchInput = document.getElementById("txnItemSearch");
  searchInput.addEventListener("input", ()=>{
    const q = norm(searchInput.value);
    const listEl = document.getElementById("txnItemList");
    if(!q){ listEl.classList.add("hidden"); return; }
    const matches = itemsCache.filter(it=> norm(it.spec).includes(q) || norm(it.model).includes(q)).slice(0,15);
    listEl.innerHTML = matches.map(it=>`<div data-id="${it.id}">${escapeHtml(it.brand)}　${escapeHtml(it.spec)}（${escapeHtml(it.model||"")}）</div>`).join("");
    listEl.classList.toggle("hidden", matches.length===0);
    listEl.querySelectorAll("div").forEach(d=>d.addEventListener("click", ()=>{
      selectedItemId = d.dataset.id;
      const it = itemsCache.find(i=>i.id===selectedItemId);
      document.getElementById("txnItemLabel").value = `${it.brand} ${it.spec}（${it.model||""}）`;
      listEl.classList.add("hidden");
      searchInput.value = "";
      refreshLocOptions();
    }));
  });
  document.getElementById("txnSubmitBtn").addEventListener("click", ()=>{
    if(!selectedItemId){ alert("請先搜尋並選擇一個品項"); return; }
    const type = document.getElementById("txnType").value;
    const qty = Number(document.getElementById("txnQty").value);
    if(!qty || qty<=0){ alert("請輸入正確的數量"); return; }

    let loc, batchDate;
    if(type === "out"){
      const idx = Number(document.getElementById("txnLoc").value);
      const opt = (window._txnOutOptions||[])[idx];
      if(!opt){ alert("請選擇要出貨的儲位（如果同一個儲位有多批不同生產日期，請選對批次）"); return; }
      loc = opt.code; batchDate = opt.date;
      if(qty > opt.qty){ alert(`這一批目前只有 ${opt.qty} 條，不能出貨 ${qty} 條`); return; }
    } else {
      loc = document.getElementById("txnLoc").value;
      if(!loc){ alert("請選擇儲位"); return; }
      batchDate = document.getElementById("txnProdDate").value.trim() || null;
    }
    submitTxn(selectedItemId, type, qty, loc, batchDate);
  });
}

async function submitTxn(itemId, type, qty, loc, batchDate){
  const itemRef = db.collection("items").doc(itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data();
  const allLocs = {...(item.locations||{})};
  let batches = normalizeBatches(allLocs[loc], item).map(b=>({...b}));
  let usedDate = null;

  if(type === "in"){
    const enteredDate = (batchDate||"").toString().trim() || null;
    if(enteredDate){
      // 有填生產日期：如果剛好跟這個儲位「現有某一批」的日期一樣，就併進那一批；不一樣就當成新的一批
      const idx = batches.findIndex(b=> (b.productionDate||null) === enteredDate);
      if(idx>=0) batches[idx].qty += qty; else batches.push({ qty, productionDate: enteredDate });
      usedDate = enteredDate;
    } else if(batches.length === 1){
      // 沒填日期，且這個儲位目前剛好只有一批：直接併入那一批，維持原本日期（跟以前行為一致）
      batches[0].qty += qty;
      usedDate = batches[0].productionDate || null;
    } else {
      // 沒填日期，且這個儲位是全新的或已經有多批：併入「未填日期」的那一批，沒有的話就新增一批未填日期的
      const idx = batches.findIndex(b=> !b.productionDate);
      if(idx>=0) batches[idx].qty += qty; else batches.push({ qty, productionDate: null });
      usedDate = null;
    }
  } else {
    // 銷貨：batchDate 是使用者在下拉選單選定「要從哪一批扣」的生產日期，直接找那一批扣庫存
    const targetDate = batchDate || null;
    const idx = batches.findIndex(b=> (b.productionDate||null) === targetDate);
    if(idx < 0){ throw new Error("找不到指定的批次，請重新整理頁面再試一次"); }
    batches[idx].qty -= qty;
    if(batches[idx].qty <= 0) batches.splice(idx, 1);
    usedDate = targetDate;
  }

  allLocs[loc] = batches.filter(b=>b.qty>0);
  if(allLocs[loc].length === 0) delete allLocs[loc];

  await itemRef.update({locations: allLocs});
  await db.collection("transactions").add({
    itemId, type, qty, loc, batchDate: usedDate, date: todayStr(), operator: currentUser.name, editLog: []
  });
  closeModal();
}

async function editTxn(txnId){
  const t = txnCache.find(x=>x.id===txnId);
  if(!t) return;
  const newQty = Number(prompt(`目前數量為 ${t.qty}，請輸入修正後的數量：`, t.qty));
  if(!newQty || newQty<=0) return;
  const diff = newQty - t.qty;
  const itemRef = db.collection("items").doc(t.itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data();
  const allLocs = {...(item.locations||{})};
  let batches = normalizeBatches(allLocs[t.loc], item).map(b=>({...b}));
  // 舊資料（改版前的紀錄）沒有 batchDate 欄位，這種情況只能盡量抓第一批來調整
  let idx = ("batchDate" in t) ? batches.findIndex(b=> (b.productionDate||null) === (t.batchDate||null)) : 0;
  if(idx < 0) idx = 0;
  if(batches.length === 0){ batches.push({ qty: 0, productionDate: t.batchDate||null }); idx = 0; }
  const sign = t.type === "in" ? 1 : -1;
  batches[idx].qty = (batches[idx].qty||0) + diff*sign;
  if(batches[idx].qty <= 0) batches.splice(idx, 1);
  allLocs[t.loc] = batches.filter(b=>b.qty>0);
  if(allLocs[t.loc].length === 0) delete allLocs[t.loc];
  await itemRef.update({locations: allLocs});
  await db.collection("transactions").doc(txnId).update({
    qty: newQty,
    editLog: firebase.firestore.FieldValue.arrayUnion({
      before: t.qty, after: newQty, time: new Date().toISOString(), by: currentUser.name
    })
  });
}

async function deleteTxn(txnId){
  const t = txnCache.find(x=>x.id===txnId);
  if(!t) return;
  if(!confirm("確定要刪除這筆紀錄嗎？（會自動把庫存改回去，並保留異動歷程）")) return;
  const itemRef = db.collection("items").doc(t.itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data();
  const allLocs = {...(item.locations||{})};
  let batches = normalizeBatches(allLocs[t.loc], item).map(b=>({...b}));
  let idx = ("batchDate" in t) ? batches.findIndex(b=> (b.productionDate||null) === (t.batchDate||null)) : 0;
  if(idx < 0) idx = 0;
  if(batches.length === 0){ batches.push({ qty: 0, productionDate: t.batchDate||null }); idx = 0; }
  const sign = t.type === "in" ? -1 : 1; // 刪除等於反向沖銷
  batches[idx].qty = (batches[idx].qty||0) + t.qty*sign;
  if(batches[idx].qty <= 0) batches.splice(idx, 1);
  allLocs[t.loc] = batches.filter(b=>b.qty>0);
  if(allLocs[t.loc].length === 0) delete allLocs[t.loc];
  await itemRef.update({locations: allLocs});
  await db.collection("editLogs").add({
    txnId, action:"delete", before:t, time:new Date().toISOString(), by:currentUser.name
  });
  await db.collection("transactions").doc(txnId).delete();
}

function openNewItemModal(){
  const brandOptions = brandsCache.length ? brandsCache : DEFAULT_BRANDS;
  const html = `
    <div class="sheet-head"><h2>新增品項</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>品牌</label>
      <select id="newItemBrand">${brandOptions.map(b=>`<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join("")}<option value="__new__">+ 新增品牌...</option></select>
    </div>
    <div class="form-row"><label>型號／花紋</label><input type="text" id="newItemModel" placeholder="例如 K-ECO"></div>
    <div class="form-row"><label>規格</label><input type="text" id="newItemSpec" placeholder="例如 205/60R16"></div>
    <div class="form-row"><label>備註</label><input type="text" id="newItemRemark"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="newItemSubmitBtn">建立品項</button>
    </div>`;
  openModal(html);
  document.getElementById("newItemBrand").addEventListener("change", (e)=>{
    if(e.target.value === "__new__"){
      const nb = prompt("請輸入新品牌名稱（建議格式：中文English，例如 米其林Michelin）");
      if(nb){
        db.collection("brands").add({name:nb});
        const opt = document.createElement("option");
        opt.value = nb; opt.textContent = nb; opt.selected = true;
        e.target.insertBefore(opt, e.target.lastElementChild);
      } else {
        e.target.value = brandOptions[0];
      }
    }
  });
  document.getElementById("newItemSubmitBtn").addEventListener("click", async ()=>{
    const brand = document.getElementById("newItemBrand").value;
    const model = document.getElementById("newItemModel").value.trim();
    const spec = document.getElementById("newItemSpec").value.trim();
    const remark = document.getElementById("newItemRemark").value.trim();
    if(!spec){ alert("請輸入規格"); return; }
    await db.collection("items").add({brand, model, spec, remark, locations:{}, twenty:null, sellPrice:null});
    closeModal();
  });
}

// ============================================================
// 訂單管理（管理者：確認/修改/取消員工在庫存查詢頁送出的叫貨）
// ============================================================
function renderOrders(){
  const body = document.getElementById("ordersBody");
  if(!body) return;
  document.getElementById("ordersCount").textContent = `共 ${ordersCache.length} 筆待確認`;
  const sorted = ordersCache.slice().sort((a,b)=> (a.requestedAt||"").localeCompare(b.requestedAt||""));
  body.innerHTML = sorted.map(o=>`<tr>
    <td>${escapeHtml((o.requestedAt||"").slice(0,16).replace("T"," "))}</td>
    <td>${escapeHtml(o.requestedByName||"")}</td>
    <td>${escapeHtml(o.itemLabel||"")}</td>
    <td>${o.qty}</td>
    <td>${o.loc?`${escapeHtml(o.loc)}${o.batchDate?`（${escapeHtml(o.batchDate)}）`:''}`:'<span class="empty-inline">未選</span>'}</td>
    <td>${escapeHtml(o.customerName||"")}</td>
    <td>${escapeHtml(o.customerContact||"")}</td>
    <td>${escapeHtml(o.customerNote||"")}</td>
    <td>
      <button data-confirm="${o.id}">確認</button>
      <button data-edit="${o.id}">修改</button>
      <button data-cancel="${o.id}">取消</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="9" class="empty">目前沒有待確認訂單</td></tr>`;

  body.querySelectorAll("[data-confirm]").forEach(b=>b.addEventListener("click", ()=> openConfirmOrderModal(b.dataset.confirm)));
  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=> openEditOrderModal(b.dataset.edit)));
  body.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click", ()=> cancelOrder(b.dataset.cancel)));
}

// 點「確認」：選好儲位/批次後才真正扣庫存，並把這筆訂單轉成正式紀錄
function openConfirmOrderModal(orderId){
  const order = ordersCache.find(o=>o.id===orderId);
  if(!order) return;
  const item = itemsCache.find(i=>i.id===order.itemId);
  if(!item){ alert("找不到這個品項，可能已被刪除。請改用「修改」換一個品項，或直接取消這筆訂單。"); return; }
  const options = locDetailList(item);
  if(options.length === 0){ alert("這個品項目前沒有庫存可以出貨，請先確認庫存，或取消這筆訂單。"); return; }

  // 預設帶入員工當初選的儲位／批次，管理者仍可以在下拉選單覆蓋改選
  let defaultIdx = options.findIndex(o=> o.code === order.loc && (o.date||null) === (order.batchDate||null));
  if(defaultIdx < 0) defaultIdx = 0;
  const employeePickNote = order.loc
    ? `<div class="note" style="background:#eef4ff;color:#2451a3;">員工原本選擇：${escapeHtml(order.loc)}${order.batchDate?`（${escapeHtml(order.batchDate)}）`:''}，如需要可在下方改選其他儲位／批次。</div>`
    : "";
  const html = `
    <div class="sheet-head"><h2>確認出貨：${escapeHtml(order.itemLabel||"")}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>客戶</label><input type="text" value="${escapeHtml(order.customerName||'')}（${escapeHtml(order.customerContact||'')}）" disabled></div>
    <div class="form-row"><label>數量</label><input type="text" value="${order.qty}" disabled></div>
    ${employeePickNote}
    <div class="form-row"><label>選擇要出貨的儲位／批次</label>
      <select id="confirmLoc">${options.map((o,i)=>`<option value="${i}" ${i===defaultIdx?'selected':''}>${escapeHtml(o.code)}${o.date?`（${escapeHtml(o.date)}）`:''}（目前${o.qty}）</option>`).join("")}</select>
    </div>
    <div class="count" id="confirmStockWarn" style="color:#a31e22;"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="confirmOrderSubmitBtn">確認出貨</button>
    </div>`;
  openModal(html);

  function refreshWarn(){
    const idx = Number(document.getElementById("confirmLoc").value);
    const opt = options[idx];
    const warnEl = document.getElementById("confirmStockWarn");
    warnEl.textContent = (opt && order.qty > opt.qty) ? `⚠ 這一批目前只有 ${opt.qty} 條，不夠出 ${order.qty} 條，請選別批或先用「修改」調整數量` : "";
  }
  document.getElementById("confirmLoc").addEventListener("change", refreshWarn);
  refreshWarn();

  document.getElementById("confirmOrderSubmitBtn").addEventListener("click", async ()=>{
    const idx = Number(document.getElementById("confirmLoc").value);
    const opt = options[idx];
    if(!opt){ alert("請選擇儲位"); return; }
    if(order.qty > opt.qty){ alert(`這一批目前只有 ${opt.qty} 條，不夠出 ${order.qty} 條，請選別批，或先用「修改」調整這筆訂單的數量`); return; }
    try{
      const txnRef = await submitOrderTxn(order, opt.code, opt.date);
      await db.collection("orders").doc(order.id).update({
        status: "confirmed", confirmedAt: new Date().toISOString(), confirmedBy: currentUser.name, linkedTxnId: txnRef.id
      });
      closeModal();
    }catch(e){
      alert("確認失敗："+e.message);
    }
  });
}

// 訂單確認出貨專用的扣庫存邏輯：跟一般銷貨一樣扣指定儲位/批次的庫存，
// 但額外把「業務(下單員工)」「客戶資訊」寫進進出貨紀錄，讓進銷貨管理表格看得到是誰賣給誰的。
async function submitOrderTxn(order, loc, batchDate){
  const itemRef = db.collection("items").doc(order.itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data();
  const allLocs = {...(item.locations||{})};
  let batches = normalizeBatches(allLocs[loc], item).map(b=>({...b}));
  const targetDate = batchDate || null;
  const idx = batches.findIndex(b=> (b.productionDate||null) === targetDate);
  if(idx < 0) throw new Error("找不到指定的批次，請重新整理頁面再試一次");
  if(batches[idx].qty < order.qty) throw new Error("這一批庫存不足，請重新選擇");
  batches[idx].qty -= order.qty;
  if(batches[idx].qty <= 0) batches.splice(idx, 1);
  allLocs[loc] = batches.filter(b=>b.qty>0);
  if(allLocs[loc].length === 0) delete allLocs[loc];
  await itemRef.update({locations: allLocs});
  return await db.collection("transactions").add({
    itemId: order.itemId, type: "out", qty: order.qty, loc, batchDate: targetDate,
    date: todayStr(), operator: currentUser.name,
    salesperson: order.requestedByName || "", customerName: order.customerName || "",
    customerContact: order.customerContact || "", customerNote: order.customerNote || "",
    orderId: order.id, editLog: []
  });
}

// 點「修改」：連品項都能換（業務在外面忙，都靠管理者統一調整），改完還是「待確認」狀態
function openEditOrderModal(orderId){
  const order = ordersCache.find(o=>o.id===orderId);
  if(!order) return;
  let selectedItemId = order.itemId;
  const html = `
    <div class="sheet-head"><h2>修改訂單</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row">
      <label>搜尋品項（要換品項才需要，不換不用理它）</label>
      <input type="text" id="editOrderItemSearch" placeholder="例如 205/60">
      <div class="autocomplete-list hidden" id="editOrderItemList"></div>
    </div>
    <div class="form-row"><label>目前品項</label><input type="text" id="editOrderItemLabel" value="${escapeHtml(order.itemLabel||'')}" disabled></div>
    <div class="form-row"><label>選擇儲位／批次</label><select id="editOrderLoc"></select></div>
    <div class="form-row"><label>數量</label><input type="number" id="editOrderQty" min="1" value="${order.qty}"></div>
    <div class="form-row"><label>客戶姓名</label><input type="text" id="editOrderCustomerName" value="${escapeHtml(order.customerName||'')}"></div>
    <div class="form-row"><label>聯絡方式</label><input type="text" id="editOrderCustomerContact" value="${escapeHtml(order.customerContact||'')}"></div>
    <div class="form-row"><label>備註</label><input type="text" id="editOrderCustomerNote" value="${escapeHtml(order.customerNote||'')}"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="editOrderSaveBtn">儲存</button>
    </div>`;
  openModal(html);

  let locOptions = [];
  function refreshEditLocOptions(){
    const it = itemsCache.find(i=>i.id===selectedItemId);
    locOptions = it ? locDetailList(it) : [];
    const locSelect = document.getElementById("editOrderLoc");
    if(locOptions.length === 0){ locSelect.innerHTML = `<option value="">目前無庫存</option>`; return; }
    let defaultIdx = locOptions.findIndex(o=> o.code === order.loc && (o.date||null) === (order.batchDate||null));
    if(defaultIdx < 0) defaultIdx = 0;
    locSelect.innerHTML = locOptions.map((o,i)=>`<option value="${i}" ${i===defaultIdx?'selected':''}>${escapeHtml(o.code)}${o.date?`（${escapeHtml(o.date)}）`:''}（目前${o.qty}）</option>`).join("");
  }
  refreshEditLocOptions();

  const searchInput = document.getElementById("editOrderItemSearch");
  searchInput.addEventListener("input", ()=>{
    const q = norm(searchInput.value);
    const listEl = document.getElementById("editOrderItemList");
    if(!q){ listEl.classList.add("hidden"); return; }
    const matches = itemsCache.filter(it=> norm(it.spec).includes(q) || norm(it.model).includes(q)).slice(0,15);
    listEl.innerHTML = matches.map(it=>`<div data-id="${it.id}">${escapeHtml(it.brand)}　${escapeHtml(it.spec)}（${escapeHtml(it.model||"")}）</div>`).join("");
    listEl.classList.toggle("hidden", matches.length===0);
    listEl.querySelectorAll("div").forEach(d=>d.addEventListener("click", ()=>{
      selectedItemId = d.dataset.id;
      const it = itemsCache.find(i=>i.id===selectedItemId);
      document.getElementById("editOrderItemLabel").value = `${it.brand} ${it.spec}（${it.model||""}）`;
      listEl.classList.add("hidden");
      searchInput.value = "";
      refreshEditLocOptions();
    }));
  });

  document.getElementById("editOrderSaveBtn").addEventListener("click", async ()=>{
    const qty = Number(document.getElementById("editOrderQty").value);
    const customerName = document.getElementById("editOrderCustomerName").value.trim();
    const customerContact = document.getElementById("editOrderCustomerContact").value.trim();
    const customerNote = document.getElementById("editOrderCustomerNote").value.trim();
    if(!qty || qty<=0){ alert("請輸入正確的數量"); return; }
    const it = itemsCache.find(i=>i.id===selectedItemId);
    const itemLabel = it ? `${it.brand} ${it.spec}（${it.model||""}）` : order.itemLabel;
    const locIdx = Number(document.getElementById("editOrderLoc").value);
    const locOpt = locOptions[locIdx];
    try{
      await db.collection("orders").doc(orderId).update({
        itemId: selectedItemId, itemLabel, qty, customerName, customerContact, customerNote,
        loc: locOpt ? locOpt.code : null, batchDate: locOpt ? (locOpt.date || null) : null
      });
      closeModal();
    }catch(e){
      alert("儲存失敗："+e.message);
    }
  });
}

function cancelOrder(orderId){
  if(!confirm("確定要取消這筆訂單嗎？")) return;
  db.collection("orders").doc(orderId).update({
    status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: currentUser.name
  }).catch(e=>alert("取消失敗："+e.message));
}

// ============================================================
// 我的訂單（員工：查看自己叫貨的狀態，待管理者確認後才算正式出貨紀錄）
// ============================================================
function renderMyOrders(){
  const body = document.getElementById("myOrdersBody");
  if(!body) return;
  const sorted = myOrdersCache.slice().sort((a,b)=> (b.requestedAt||"").localeCompare(a.requestedAt||""));
  document.getElementById("myOrdersCount").textContent = `共 ${sorted.length} 筆`;
  const statusLabel = { pending:"待確認", confirmed:"已出貨", cancelled:"已取消" };
  body.innerHTML = sorted.map(o=>`<tr>
    <td>${escapeHtml((o.requestedAt||"").slice(0,16).replace("T"," "))}</td>
    <td>${escapeHtml(o.itemLabel||"")}</td>
    <td>${o.qty}</td>
    <td>${escapeHtml(o.customerName||"")}</td>
    <td>${statusLabel[o.status]||o.status}</td>
  </tr>`).join("") || `<tr><td colspan="5" class="empty">尚無訂單紀錄</td></tr>`;
}

// ============================================================
// 儲位管理
// ============================================================
document.getElementById("addLocBtn").addEventListener("click", async ()=>{
  const code = document.getElementById("newLocInput").value.trim();
  if(!code){ alert("請輸入儲位代碼"); return; }
  if(locationsCache.some(l=>l.code===code)){ alert("這個儲位代碼已經存在"); return; }
  await db.collection("locations").add({code});
  document.getElementById("newLocInput").value = "";
});

function renderLocations(){
  const body = document.getElementById("locBody");
  body.innerHTML = locationsCache.map(l=>
    `<tr><td>${escapeHtml(l.code)}</td><td><button data-del="${l.id}" data-code="${escapeHtml(l.code)}">刪除</button></td></tr>`
  ).join("") || `<tr><td colspan="2" class="empty">尚無儲位</td></tr>`;
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=>deleteLocation(b.dataset.del, b.dataset.code)));
}

function deleteLocation(locId, code){
  const blocking = itemsCache.filter(it=> locQty((it.locations||{})[code]) > 0);
  if(blocking.length){
    const detail = blocking.map(it=>`${it.brand} ${it.spec}：${locQty(it.locations[code])}`).join("\n");
    alert(`這個儲位還有庫存，無法直接刪除。請先把以下品項搬到其他儲位：\n\n${detail}`);
    return;
  }
  if(confirm(`確定要刪除儲位「${code}」嗎？`)){
    db.collection("locations").doc(locId).delete();
  }
}

// ============================================================
// 使用者管理
// ============================================================
document.getElementById("newUserBtn").addEventListener("click", openNewUserModal);

function renderUsers(){
  const body = document.getElementById("userBody");
  body.innerHTML = usersCache.map(u=>`<tr>
    <td>${escapeHtml(u.name)}</td>
    <td>${escapeHtml(u.username)}</td>
    <td>${u.role==='admin'?'管理者':'員工'}</td>
    <td><span class="badge ${u.active!==false?'on':'off'}">${u.active!==false?'啟用':'停用'}</span></td>
    <td class="pw-cell" data-id="${u.id}" style="cursor:pointer;text-decoration:underline dotted;">${escapeHtml(u.pwNote||"未填")}</td>
    <td>
      <button data-toggle="${u.id}" data-active="${u.active!==false}">${u.active!==false?'停用':'啟用'}</button>
      <button data-edit="${u.id}">編輯</button>
      <button data-del="${u.id}" data-name="${escapeHtml(u.name)}">刪除</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="6" class="empty">尚無使用者</td></tr>`;
  body.querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click", ()=>{
    const newActive = b.dataset.active !== "true";
    db.collection("users").doc(b.dataset.toggle).update({active:newActive});
  }));
  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=> editUser(b.dataset.edit)));
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=> deleteUser(b.dataset.del, b.dataset.name)));
  body.querySelectorAll(".pw-cell").forEach(td=>td.addEventListener("click", ()=> editPwNote(td.dataset.id)));
}

function editPwNote(uid){
  const u = usersCache.find(x=>x.id===uid);
  if(!u) return;
  const input = prompt("密碼備註（僅供你自己回頭查看用，不是即時同步的真正密碼，員工自行改密碼後這裡不會自動更新）：", u.pwNote||"");
  if(input === null) return;
  db.collection("users").doc(uid).update({ pwNote: input.trim() || null })
    .catch(e=>alert("更新失敗："+e.message));
}

function editUser(uid){
  const u = usersCache.find(x=>x.id===uid);
  if(!u) return;
  const newName = prompt("修改姓名：", u.name);
  if(newName === null) return; // 取消
  const roleInput = prompt("修改角色：輸入「管理者」或「員工」", u.role==='admin'?'管理者':'員工');
  if(roleInput === null) return; // 取消
  const role = roleInput.trim()==='管理者' ? 'admin' : 'member';
  db.collection("users").doc(uid).update({ name: newName.trim() || u.name, role })
    .catch(e=>alert("更新失敗："+e.message));
}

function deleteUser(uid, name){
  if(uid === currentUser.uid){ alert("不能刪除自己目前登入中的帳號"); return; }
  if(!confirm(`確定要刪除使用者「${name}」嗎？\n刪除後此帳號會完全無法登入系統（無法復原，需要重新建立帳號）。`)) return;
  db.collection("users").doc(uid).delete()
    .then(()=>alert("已刪除，此帳號已無法登入系統。"))
    .catch(e=>alert("刪除失敗："+e.message));
}

// ---------- 自己改自己的密碼（免費、不需要Admin SDK，任何角色登入後都能用）----------
document.getElementById("changePwBtn").addEventListener("click", async ()=>{
  if(!currentUser) return;
  const oldPw = prompt("請先輸入目前的密碼（用來確認身分）：");
  if(oldPw === null) return;
  const newPw = prompt("請輸入新密碼（至少6碼）：");
  if(newPw === null) return;
  if(!newPw || newPw.length < 6){ alert("新密碼至少要6碼"); return; }
  try{
    const email = currentUser.username + "@" + INTERNAL_EMAIL_DOMAIN;
    const cred = firebase.auth.EmailAuthProvider.credential(email, oldPw);
    await auth.currentUser.reauthenticateWithCredential(cred);
    await auth.currentUser.updatePassword(newPw);
    await db.collection("users").doc(currentUser.uid).update({ pwNote: newPw }).catch(()=>{});
    alert("密碼修改成功，下次登入請用新密碼。");
  }catch(e){
    alert("修改失敗：" + (e.code==='auth/wrong-password' ? "目前密碼輸入錯誤" : e.message));
  }
});

function openNewUserModal(){
  const html = `
    <div class="sheet-head"><h2>新增使用者</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>姓名</label><input type="text" id="newUserName"></div>
    <div class="form-row"><label>帳號（不用email格式，簡單英數即可）</label><input type="text" id="newUserUsername"></div>
    <div class="form-row"><label>初始密碼</label><input type="text" id="newUserPassword" value="123456"></div>
    <div class="form-row"><label>角色</label>
      <select id="newUserRole"><option value="member">員工</option><option value="admin">管理者</option></select>
    </div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="newUserSubmitBtn">建立帳號</button>
    </div>`;
  openModal(html);
  document.getElementById("newUserSubmitBtn").addEventListener("click", async ()=>{
    const name = document.getElementById("newUserName").value.trim();
    const uname = document.getElementById("newUserUsername").value.trim();
    const pw = document.getElementById("newUserPassword").value;
    const role = document.getElementById("newUserRole").value;
    if(!name || !uname || !pw){ alert("請填寫完整資料"); return; }
    const email = uname + "@" + INTERNAL_EMAIL_DOMAIN;
    try{
      const cred = await secondaryAuth.createUserWithEmailAndPassword(email, pw);
      await db.collection("users").doc(cred.user.uid).set({name, username:uname, role, active:true, pwNote: pw});
      await secondaryAuth.signOut();
      closeModal();
    }catch(e){
      alert("建立失敗：" + e.message);
    }
  });
}

// ============================================================
// 資料匯入（一次性工具，可重複使用）
// ============================================================
document.getElementById("clearDataBtn").addEventListener("click", async ()=>{
  if(!confirm("確定要清除所有「品項」與「儲位」資料嗎？（不會動到使用者帳號跟進出貨紀錄）這通常是為了重新匯入正確的資料才做，確定要繼續嗎？")) return;
  const statusEl = document.getElementById("importStatus");
  statusEl.textContent = "清除中...";
  const itemsSnap = await db.collection("items").get();
  const locSnap = await db.collection("locations").get();
  const allDocs = [...itemsSnap.docs, ...locSnap.docs];
  let done = 0;
  while(done < allDocs.length){
    const batch = db.batch();
    allDocs.slice(done, done+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
    done += 400;
  }
  statusEl.textContent = `已清除 ${itemsSnap.size} 筆品項與 ${locSnap.size} 筆儲位資料，可以重新選檔匯入了。`;
});

document.getElementById("importBtn").addEventListener("click", async ()=>{
  const fileInput = document.getElementById("importFile");
  const statusEl = document.getElementById("importStatus");
  if(!fileInput.files.length){ alert("請先選擇檔案"); return; }
  statusEl.textContent = "讀取檔案中...";
  const file = fileInput.files[0];
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {type:"array"});

  // 自動判斷：如果是「匯出完整備份」產生的檔案（有這三個分頁），走「還原備份」流程；
  // 如果是賽輪總表（含「品名規格」「花紋」欄位），走賽輪規格匯入流程；
  // 否則走原本「舊資料整併結果」的匯入流程。
  if(wb.Sheets["品項主檔"] && wb.Sheets["儲位主檔"]){
    await restoreFullBackup(wb, statusEl);
    return;
  }

  if(await tryImportSailunSheet(wb, statusEl)) return;

  const knownLocationCodes = new Set(locationsCache.map(l=>l.code));
  const newItems = [];

  const sheet1 = wb.Sheets["已比對成功(總倉屏東分開)"];
  if(sheet1){
    const rows = XLSX.utils.sheet_to_json(sheet1);
    rows.forEach(r=>{
      const zongCode = (r["總倉儲位代碼"] || "總倉(未指定儲位)").toString().trim();
      const zongQty = Number(r["總倉數量"]) || 0;
      const pingQty = Number(r["屏東數量"]) || 0;
      // 年分是舊資料的整批共用日期，先各自帶到每個儲位上，之後可以在庫存總表逐一點擊修正成正確的批次日期
      const yearRaw = (r["年分"] || "").toString().trim() || null;
      const locs = {};
      if(zongQty > 0){ locs[zongCode] = {qty:zongQty, productionDate:yearRaw}; knownLocationCodes.add(zongCode); }
      if(pingQty > 0){ locs["屏東"] = {qty:pingQty, productionDate:yearRaw}; knownLocationCodes.add("屏東"); }
      const costVal = r["成本(已套1.25)"];
      // 舊格式只有單一成本欄位，先併入「20%」欄位，「售價」留空待後續補齊
      newItems.push({
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: locs, remark: r["備註"] || "",
        twenty: (costVal === undefined || costVal === null || costVal === "") ? null : Number(costVal),
        sellPrice: null
      });
    });
  }

  const sheet2 = wb.Sheets["其他品牌(此檔未涵蓋位區成本)"];
  if(sheet2){
    const rows = XLSX.utils.sheet_to_json(sheet2);
    rows.forEach(r=>{
      const zongQty = Number(r["總倉數量"]) || 0;
      const pingQty = Number(r["屏東數量"]) || 0;
      const locs = {};
      if(zongQty > 0){ locs["總倉(未指定儲位)"] = {qty:zongQty, productionDate:null}; knownLocationCodes.add("總倉(未指定儲位)"); }
      if(pingQty > 0){ locs["屏東"] = {qty:pingQty, productionDate:null}; knownLocationCodes.add("屏東"); }
      newItems.push({
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: locs, remark: r["備註"] || "", twenty: null, sellPrice: null
      });
    });
  }

  if(newItems.length === 0){ statusEl.textContent = "找不到可匯入的分頁，請確認上傳的是「庫存資料整併結果.xlsx」"; return; }

  statusEl.textContent = `匯入中...共 ${newItems.length} 筆品項，${knownLocationCodes.size} 個儲位`;

  // 先建立儲位（略過已存在的）
  for(const code of knownLocationCodes){
    if(!locationsCache.some(l=>l.code===code)){
      await db.collection("locations").add({code});
    }
  }

  // 分批寫入品項（Firestore batch 上限500筆）
  let count = 0;
  while(count < newItems.length){
    const batch = db.batch();
    const chunk = newItems.slice(count, count+400);
    chunk.forEach(it=>{
      const ref = db.collection("items").doc();
      batch.set(ref, it);
    });
    await batch.commit();
    count += chunk.length;
    statusEl.textContent = `匯入中...已完成 ${count}/${newItems.length}`;
  }

  statusEl.textContent = `匯入完成！共新增 ${newItems.length} 筆品項。可以到「庫存查詢」或「庫存總表」查看。`;
});

// 把「儲位分布」欄位的顯示文字（例如「A左×8(4125)、A左×4(1626)、屏東×2」）還原成
// {A左:[{qty:8,productionDate:"4125"},{qty:4,productionDate:"1626"}], 屏東:[{qty:2,productionDate:null}]} 這種資料格式
// 注意：同一個儲位代碼可能出現兩次（代表兩批不同生產日期），所以要用陣列累加，不能直接覆蓋。
function parseLocSummaryText(str){
  const locs = {};
  if(!str || str === "-") return locs;
  str.toString().split("、").forEach(pair=>{
    const m = /^(.+)×(\d+)(?:\((.+)\))?$/.exec(pair.trim());
    if(!m) return;
    const code = m[1];
    if(!locs[code]) locs[code] = [];
    locs[code].push({ qty: Number(m[2]), productionDate: m[3] || null });
  });
  return locs;
}

// ============================================================
// 匯入賽輪總表（廠商提供的報價/庫存總表，含「品名規格」「花紋」「20%」「售價」欄位）
// ============================================================
// 掃描每個分頁的前幾列，找出含有「品名規格」與「花紋」欄位的表頭列，藉此自動辨認這是賽輪總表，
// 而不是靠檔名或固定分頁名稱（廠商給的檔名/分頁名稱每次可能不太一樣）。
function detectSailunSheet(wb){
  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, blankrows:true});
    for(let r=0; r<Math.min(rows.length, 10); r++){
      const row = rows[r] || [];
      if(row.includes("品名規格") && row.includes("花紋")){
        return { rows, headerRowIndex: r };
      }
    }
  }
  return null;
}

async function tryImportSailunSheet(wb, statusEl){
  const detected = detectSailunSheet(wb);
  if(!detected) return false;

  const header = detected.rows[detected.headerRowIndex];
  const specIdx = header.indexOf("品名規格");
  const modelIdx = header.indexOf("花紋");
  const twentyIdx = modelIdx + 1;  // 花紋欄右邊是「20%」欄（表頭儲存格是數字0.2）
  const priceIdx = modelIdx + 2;   // 再右邊是「售價」欄；「完工售價」欄不匯入
  const remarkIdx = header.indexOf("備註");

  const dataRows = detected.rows.slice(detected.headerRowIndex + 1);
  const merged = new Map(); // key: 正規化後的「規格|花紋」-> {spec, model, twenty, sellPrice}
  let skippedCount = 0;

  dataRows.forEach(row=>{
    if(!row) return;
    const specRaw = row[specIdx];
    const modelRaw = row[modelIdx];
    const specStr = (specRaw==null?"":specRaw).toString().trim();
    const modelStr = (modelRaw==null?"":modelRaw).toString().trim();
    if(!specStr && !modelStr) return; // 空白列
    const remarkStr = remarkIdx>=0 ? (row[remarkIdx]==null?"":row[remarkIdx].toString()) : "";
    if(remarkStr.includes("下市")){ skippedCount++; return; } // 只跳過備註含「下市」的品項
    const twentyRaw = row[twentyIdx];
    const priceRaw = row[priceIdx];
    const key = norm(specStr) + "|" + norm(modelStr);
    // 同一份表如果同規格花紋出現兩次（例如廠商後面又補一次新價格），以後面出現的那一筆為準
    merged.set(key, {
      spec: specStr, model: modelStr,
      twenty: (twentyRaw===null||twentyRaw===undefined||twentyRaw==="") ? null : Number(twentyRaw),
      sellPrice: (priceRaw===null||priceRaw===undefined||priceRaw==="") ? null : Number(priceRaw)
    });
  });

  const rowsToApply = Array.from(merged.values());
  statusEl.textContent = `偵測到賽輪總表，共 ${rowsToApply.length} 筆規格（已跳過備註含「下市」的 ${skippedCount} 筆），匯入中...`;

  let created = 0, updated = 0;
  let batch = db.batch();
  let opCount = 0;
  for(const r of rowsToApply){
    const existing = itemsCache.find(it=> norm(it.brand)===norm("賽輪Sailun") && norm(it.spec)===norm(r.spec) && norm(it.model)===norm(r.model));
    if(existing){
      // 重複的規格＋花紋：只更新20%／售價，不新增品項
      batch.update(db.collection("items").doc(existing.id), { twenty: r.twenty, sellPrice: r.sellPrice });
      updated++;
    } else {
      const ref = db.collection("items").doc();
      batch.set(ref, { brand:"賽輪Sailun", model:r.model, spec:r.spec, remark:"", locations:{}, twenty:r.twenty, sellPrice:r.sellPrice });
      created++;
    }
    opCount++;
    if(opCount >= 400){ await batch.commit(); batch = db.batch(); opCount = 0; }
  }
  if(opCount > 0) await batch.commit();

  statusEl.textContent = `賽輪總表匯入完成！新增 ${created} 筆、更新20%／售價 ${updated} 筆（跳過備註含「下市」的 ${skippedCount} 筆）。`;
  return true;
}

// ============================================================
// 還原完整備份（把「匯出完整備份(Excel)」產生的檔案，完整套用回資料庫）
// ============================================================
async function restoreFullBackup(wb, statusEl){
  const ok = confirm(
    "偵測到這是「完整備份」檔案。\n\n" +
    "還原會先清除目前所有品項、儲位、進出貨紀錄，換成這份備份「當時」的內容（含當時的成本、儲位、生產日期）。\n" +
    "此動作無法復原，請確認這是你要的備份時間點。\n\n確定要繼續還原嗎？"
  );
  if(!ok){ statusEl.textContent = "已取消還原。"; return; }

  statusEl.textContent = "清除目前資料中...";
  const itemsSnap = await db.collection("items").get();
  const locSnap = await db.collection("locations").get();
  const txnSnap = await db.collection("transactions").get();
  const allDocs = [...itemsSnap.docs, ...locSnap.docs, ...txnSnap.docs];
  let done = 0;
  while(done < allDocs.length){
    const batch = db.batch();
    allDocs.slice(done, done+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
    done += 400;
  }

  const itemRows = XLSX.utils.sheet_to_json(wb.Sheets["品項主檔"] || {});
  const locRows = XLSX.utils.sheet_to_json(wb.Sheets["儲位主檔"] || {});
  const txnRows = wb.Sheets["進出貨紀錄"] ? XLSX.utils.sheet_to_json(wb.Sheets["進出貨紀錄"]) : [];

  // 品項：沿用備份裡的 id 當作 Firestore 文件ID，這樣進出貨紀錄的 itemId 才能正確對應回來
  let count = 0;
  while(count < itemRows.length){
    const batch = db.batch();
    itemRows.slice(count, count+400).forEach(r=>{
      const id = (r["id"] || "").toString().trim();
      if(!id) return;
      batch.set(db.collection("items").doc(id), {
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: parseLocSummaryText(r["儲位分布"]),
        twenty: (r["20%"] === undefined || r["20%"] === null || r["20%"] === "") ? null : Number(r["20%"]),
        sellPrice: (r["售價"] === undefined || r["售價"] === null || r["售價"] === "") ? null : Number(r["售價"]),
        remark: r["備註"] || ""
      });
    });
    await batch.commit();
    count += 400;
    statusEl.textContent = `還原品項中...${Math.min(count,itemRows.length)}/${itemRows.length}`;
  }

  // 儲位
  count = 0;
  while(count < locRows.length){
    const batch = db.batch();
    locRows.slice(count, count+400).forEach(r=>{
      const code = (r["儲位代碼"] || "").toString().trim();
      if(!code) return;
      batch.set(db.collection("locations").doc(), {code});
    });
    await batch.commit();
    count += 400;
  }

  // 進出貨紀錄
  count = 0;
  while(count < txnRows.length){
    const batch = db.batch();
    txnRows.slice(count, count+400).forEach(r=>{
      batch.set(db.collection("transactions").doc(), {
        itemId: r["itemId"] || "",
        type: r["type"] || "in",
        qty: Number(r["qty"]) || 0,
        loc: r["loc"] || "",
        date: r["date"] || todayStr(),
        operator: r["operator"] || "",
        editLog: [] // 逐次修改歷程無法透過Excel完整保留，還原後重新開始記錄
      });
    });
    await batch.commit();
    count += 400;
    statusEl.textContent = `還原進出貨紀錄中...${Math.min(count,txnRows.length)}/${txnRows.length}`;
  }

  statusEl.textContent = `還原完成！共還原 ${itemRows.length} 筆品項、${locRows.length} 個儲位、${txnRows.length} 筆進出貨紀錄`
    + `（提醒：每筆紀錄過去的逐次編輯歷程無法透過Excel完整保留，但庫存數量、成本、儲位、生產日期都已正確還原）。`;
}

// ============================================================
// 匯入 KYB 報價單（建立車型清單，庫存/儲位之後再自行輸入）
// ============================================================
function detectKybSheet(wb){
  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, blankrows:true});
    for(let r=0; r<Math.min(rows.length, 10); r++){
      const row = rows[r] || [];
      if(row.includes("車型") && row.includes("訂價") && row.includes("牌價")){
        return { rows, headerRowIndex: r };
      }
    }
  }
  return null;
}

async function tryImportKybSheet(wb, statusEl){
  const detected = detectKybSheet(wb);
  if(!detected) return false;

  const header = detected.rows[detected.headerRowIndex];
  const modelIdx = header.indexOf("車型");
  const listIdx = header.indexOf("訂價");
  const catalogIdx = header.indexOf("牌價");
  const warrantyIdx = header.indexOf("保修廠");

  const dataRows = detected.rows.slice(detected.headerRowIndex + 1);
  const merged = new Map();
  let skippedNoteCount = 0;
  dataRows.forEach(row=>{
    if(!row) return;
    const modelRaw = row[modelIdx];
    const modelStr = (modelRaw==null?"":modelRaw).toString().trim();
    if(!modelStr) return;
    // 報價單常常在車型欄下方接一段免責聲明／注意事項文字（跟車型同一欄），
    // 車型名稱通常很短，這種備註文字明顯很長，用長度判斷跳過，避免被誤當成車型匯入。
    if(modelStr.length > 30){ skippedNoteCount++; return; }
    const toNum = (v)=> (v===null||v===undefined||v==="") ? null : Number(v);
    merged.set(norm(modelStr), {
      carModel: modelStr,
      listPrice: toNum(row[listIdx]),
      catalogPrice: toNum(row[catalogIdx]),
      warrantyPrice: warrantyIdx>=0 ? toNum(row[warrantyIdx]) : null
    });
  });

  const rowsToApply = Array.from(merged.values());
  statusEl.textContent = `偵測到KYB報價單，共 ${rowsToApply.length} 筆車型${skippedNoteCount?`（已跳過看起來像備註文字的 ${skippedNoteCount} 列）`:""}，匯入中...`;

  let created = 0, updated = 0;
  let batch = db.batch();
  let opCount = 0;
  for(const r of rowsToApply){
    const existing = kybItemsCache.find(it=> norm(it.carModel)===norm(r.carModel));
    if(existing){
      batch.update(db.collection("kybItems").doc(existing.id), {
        listPrice: r.listPrice, catalogPrice: r.catalogPrice, warrantyPrice: r.warrantyPrice
      });
      updated++;
    } else {
      const ref = db.collection("kybItems").doc();
      batch.set(ref, {
        carModel: r.carModel, brand: "KYB", remark: "", locations: {},
        listPrice: r.listPrice, catalogPrice: r.catalogPrice, warrantyPrice: r.warrantyPrice
      });
      created++;
    }
    opCount++;
    if(opCount >= 400){ await batch.commit(); batch = db.batch(); opCount = 0; }
  }
  if(opCount > 0) await batch.commit();

  statusEl.textContent = `KYB報價單匯入完成！新增 ${created} 筆車型、更新 ${updated} 筆價格${skippedNoteCount?`（已跳過看起來像備註文字的 ${skippedNoteCount} 列）`:""}。`;
  return true;
}

// ============================================================
// KYB 專用的資料匯入／清除（獨立於輪胎的資料匯入頁面，避免誤刪對方的資料）
// ============================================================
document.getElementById("kybClearDataBtn").addEventListener("click", async ()=>{
  if(!confirm("確定要清除所有「KYB車型」與「KYB儲位」資料嗎？（不會動到輪胎資料，也不會動到KYB的進出貨紀錄）這通常是為了重新匯入正確的資料才做，確定要繼續嗎？")) return;
  const statusEl = document.getElementById("kybImportStatus");
  statusEl.textContent = "清除中...";
  const itemsSnap = await db.collection("kybItems").get();
  const locSnap = await db.collection("kybLocations").get();
  const allDocs = [...itemsSnap.docs, ...locSnap.docs];
  let done = 0;
  while(done < allDocs.length){
    const batch = db.batch();
    allDocs.slice(done, done+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
    done += 400;
  }
  statusEl.textContent = `已清除 ${itemsSnap.size} 筆KYB車型與 ${locSnap.size} 筆儲位資料，可以重新選檔匯入了。`;
});

document.getElementById("kybImportBtn").addEventListener("click", async ()=>{
  const fileInput = document.getElementById("kybImportFile");
  const statusEl = document.getElementById("kybImportStatus");
  if(!fileInput.files.length){ alert("請先選擇檔案"); return; }
  statusEl.textContent = "讀取檔案中...";
  const file = fileInput.files[0];
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {type:"array"});
  if(await tryImportKybSheet(wb, statusEl)) return;
  statusEl.textContent = "找不到可匯入的KYB報價單格式，請確認上傳的檔案含「車型」「訂價」「牌價」欄位。";
});

// ============================================================
// KYB 避震器模組（獨立品項：無生產批次／效期，但有完整叫貨/訂單管理/進銷貨流程）
// ============================================================

// ---------- KYB 庫存查詢 ----------
document.getElementById("kybQueryBox").addEventListener("input", renderKybQuery);

function renderKybQuery(){
  const box = document.getElementById("kybQueryResults");
  const countEl = document.getElementById("kybQueryCount");
  const q = norm(document.getElementById("kybQueryBox").value);

  let list = kybItemsCache.slice();
  if(q) list = list.filter(it=> norm(it.carModel).includes(q));
  list.sort((a,b)=> (kybTotalQty(b)>0?1:0) - (kybTotalQty(a)>0?1:0));

  const inStockCount = list.filter(it=>kybTotalQty(it)>0).length;
  countEl.textContent = q ? `找到 ${list.length} 筆（有庫存 ${inStockCount} 筆）` : `共 ${list.length} 筆車型（有庫存 ${inStockCount} 筆）`;

  box.innerHTML = list.slice(0,200).map(it=>{
    const qty = kybTotalQty(it);
    const noStock = qty <= 0;
    return `<div class="card${noStock?' card-nostock':''}">
      <div class="code-row">
        <div class="code">${escapeHtml(it.carModel)}</div>
        ${noStock ? '' : `<button class="order-btn" data-id="${it.id}">${ICONS.cart}叫貨</button>`}
      </div>
      <div class="sub">KYB</div>
      <div class="qty">庫存 ${qty}${it.listPrice!=null?`　　訂價 ${it.listPrice}`:""}${it.catalogPrice!=null?`　　牌價 ${it.catalogPrice}`:""}${it.warrantyPrice!=null?`　　保修廠 ${it.warrantyPrice}`:""}</div>
      <div class="sub">儲位：${escapeHtml(kybLocSummary(it))}</div>
    </div>`;
  }).join("") || `<div class="empty">查無符合的車型</div>`;

  box.querySelectorAll(".order-btn").forEach(b=>{
    b.addEventListener("click", ()=> openKybOrderModal(b.dataset.id));
  });
}

function openKybOrderModal(itemId){
  const item = kybItemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const options = kybLocList(item);
  const totalAvail = kybTotalQty(item);
  const html = `
    <div class="sheet-head"><h2>叫貨：${escapeHtml(item.carModel)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>車型／品牌</label><input type="text" value="${escapeHtml(item.carModel)}（KYB）" disabled></div>
    <div class="form-row"><label>目前總庫存</label><input type="text" value="${totalAvail}" disabled></div>
    <div class="form-row"><label>選擇儲位</label>
      <select id="kybOrderLoc">${options.length ? options.map((o,i)=>`<option value="${i}">${escapeHtml(o.code)}（目前${o.qty}）</option>`).join("") : `<option value="">目前無庫存</option>`}</select>
    </div>
    <div class="form-row"><label>數量</label><select id="kybOrderQty"></select></div>
    <div class="form-row"><label>客戶姓名</label><input type="text" id="kybOrderCustomerName"></div>
    <div class="form-row"><label>聯絡方式</label><input type="text" id="kybOrderCustomerContact"></div>
    <div class="form-row"><label>備註</label><input type="text" id="kybOrderCustomerNote"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="kybOrderSubmitBtn">送出叫貨</button>
    </div>`;
  openModal(html);

  function refreshQtyOptions(){
    const idx = Number(document.getElementById("kybOrderLoc").value);
    const opt = options[idx];
    const qtySelect = document.getElementById("kybOrderQty");
    if(!opt){ qtySelect.innerHTML = `<option value="0">目前無庫存</option>`; return; }
    qtySelect.innerHTML = Array.from({length:opt.qty},(_,i)=>i+1).map(n=>`<option value="${n}">${n}</option>`).join("");
  }
  if(options.length) document.getElementById("kybOrderLoc").addEventListener("change", refreshQtyOptions);
  refreshQtyOptions();

  document.getElementById("kybOrderSubmitBtn").addEventListener("click", async ()=>{
    const idx = Number(document.getElementById("kybOrderLoc").value);
    const opt = options[idx];
    const qty = Number(document.getElementById("kybOrderQty").value);
    const customerName = document.getElementById("kybOrderCustomerName").value.trim();
    const customerContact = document.getElementById("kybOrderCustomerContact").value.trim();
    const customerNote = document.getElementById("kybOrderCustomerNote").value.trim();
    if(!opt){ alert("這個車型目前沒有庫存可以叫貨"); return; }
    if(!qty || qty<=0){ alert("請輸入正確的數量"); return; }
    if(qty > opt.qty){ alert(`這個儲位目前只有 ${opt.qty}，不能叫超過這個數量`); return; }
    if(!customerName){ alert("請輸入客戶姓名"); return; }
    try{
      await db.collection("kybOrders").add({
        itemId: item.id, itemLabel: `${item.carModel}（KYB）`,
        qty, loc: opt.code,
        customerName, customerContact, customerNote,
        requestedByUid: currentUser.uid, requestedByName: currentUser.name,
        status: "pending", requestedAt: new Date().toISOString()
      });
      closeModal();
      alert("已送出，等待管理者確認出貨。");
    }catch(e){
      alert("送出失敗："+e.message);
    }
  });
}

// ---------- KYB 庫存總表 ----------
document.getElementById("kybMasterBox").addEventListener("input", renderKybMaster);

function renderKybMaster(){
  const q = norm(document.getElementById("kybMasterBox").value);
  let list = kybItemsCache.slice();
  if(q) list = list.filter(it=> norm(it.carModel).includes(q));

  document.getElementById("kybMasterCount").textContent = `共 ${list.length} 筆`;

  const body = document.getElementById("kybMasterBody");
  body.innerHTML = list.map(it=>{
    const options = kybLocList(it);
    const locHtml = options.length
      ? options.map(o=>`<div class="loc-line" data-id="${it.id}" data-code="${escapeHtml(o.code)}">${escapeHtml(o.code)}：${o.qty}</div>`).join("")
      : `<span class="empty-inline">無庫存</span>`;
    return `<tr>
      <td>${escapeHtml(it.carModel)}</td>
      <td>KYB</td>
      <td>${kybTotalQty(it)}</td>
      <td class="loc-detail-cell">${locHtml}</td>
      <td class="editable-cell kyb-list-cell" data-id="${it.id}">${it.listPrice!=null?it.listPrice:"未填"}</td>
      <td class="editable-cell kyb-catalog-cell" data-id="${it.id}">${it.catalogPrice!=null?it.catalogPrice:"未填"}</td>
      <td class="editable-cell kyb-warranty-cell" data-id="${it.id}">${it.warrantyPrice!=null?it.warrantyPrice:"未填"}</td>
      <td>${escapeHtml(it.remark||"")}</td>
      <td>${currentUser.role==='admin' ? `<button data-del="${it.id}" data-model="${escapeHtml(it.carModel)}">刪除</button>` : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="empty">尚無資料</td></tr>`;

  body.querySelectorAll(".loc-line").forEach(el=>{
    el.addEventListener("click", ()=> openKybLocationModal(el.dataset.id, el.dataset.code));
  });
  if(currentUser.role === "admin"){
    body.querySelectorAll(".kyb-list-cell").forEach(td=> td.addEventListener("click", ()=> editKybPrice(td.dataset.id, "listPrice", "訂價")));
    body.querySelectorAll(".kyb-catalog-cell").forEach(td=> td.addEventListener("click", ()=> editKybPrice(td.dataset.id, "catalogPrice", "牌價")));
    body.querySelectorAll(".kyb-warranty-cell").forEach(td=> td.addEventListener("click", ()=> editKybPrice(td.dataset.id, "warrantyPrice", "保修廠")));
    body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", ()=> deleteKybItem(b.dataset.del, b.dataset.model)));
  } else {
    body.querySelectorAll(".kyb-list-cell,.kyb-catalog-cell,.kyb-warranty-cell").forEach(td=> td.classList.remove("editable-cell"));
  }
  window._kybMasterFilteredList = list;
}

// 刪除一個KYB車型品項（例如匯入時誤把報價單裡的免責聲明文字當成車型匯進來，需要手動清掉）
function deleteKybItem(itemId, carModel){
  if(currentUser.role !== "admin") return;
  const item = kybItemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const qty = kybTotalQty(item);
  if(qty > 0){
    alert(`「${carModel}」目前還有庫存（共 ${qty}），請先到儲位管理把庫存搬空或歸零，再刪除這個車型。`);
    return;
  }
  if(!confirm(`確定要刪除車型「${carModel}」嗎？此動作無法復原。`)) return;
  db.collection("kybItems").doc(itemId).delete()
    .catch(e=>alert("刪除失敗："+e.message));
}

// 點擊某個儲位：因為KYB沒有生產批次，這裡就是單純的「搬出數量到別的儲位」
function openKybLocationModal(itemId, code){
  const item = kybItemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const allLocs = item.locations || {};
  const qty = kybLocQty(allLocs[code]);
  const allCodes = kybLocationsCache.map(l=>l.code);

  const html = `
    <div class="sheet-head"><h2>儲位管理：${escapeHtml(code)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>目前儲位</label><input type="text" value="${escapeHtml(code)}" disabled></div>
    <div class="form-row"><label>目前庫存</label><input type="text" value="${qty}" disabled></div>
    <div class="form-row"><label>搬出數量（不搬就留空）</label><input type="number" id="kybMoveQty" min="1" max="${qty}"></div>
    <div class="form-row"><label>搬到哪個儲位（只能選現有儲位）</label>
      <select id="kybMoveTarget"><option value="">請選擇</option>${allCodes.filter(c=>c!==code).map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select>
    </div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="kybLocSaveBtn">儲存</button>
    </div>`;
  openModal(html);

  document.getElementById("kybLocSaveBtn").addEventListener("click", ()=>{
    const moveQtyRaw = document.getElementById("kybMoveQty").value;
    const moveTarget = document.getElementById("kybMoveTarget").value;
    const moveQty = moveQtyRaw ? Number(moveQtyRaw) : 0;
    if(moveQty <= 0){ closeModal(); return; }
    if(!moveTarget){ alert("請選擇要搬到哪個儲位"); return; }
    if(moveQty > qty){ alert("搬出數量不能超過目前庫存"); return; }

    const newLocs = {...allLocs};
    newLocs[code] = qty - moveQty;
    newLocs[moveTarget] = kybLocQty(newLocs[moveTarget]) + moveQty;
    if(newLocs[code] <= 0) delete newLocs[code];

    db.collection("kybItems").doc(itemId).update({ locations: newLocs })
      .then(()=>closeModal())
      .catch(e=>alert("更新失敗："+e.message));
  });
}

function editKybPrice(itemId, field, label){
  if(currentUser.role !== "admin") return;
  const item = kybItemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const cur = item[field]!=null ? String(item[field]) : "";
  const input = prompt(`輸入${label}金額（純數字）`, cur);
  if(input === null) return;
  const val = input.trim();
  const update = {};
  if(val === ""){ update[field] = null; }
  else{
    const num = Number(val);
    if(isNaN(num)){ alert("請輸入數字"); return; }
    update[field] = num;
  }
  db.collection("kybItems").doc(itemId).update(update).catch(e=>alert("更新失敗："+e.message));
}

document.getElementById("kybExportBtn").addEventListener("click", ()=>{
  const list = window._kybMasterFilteredList || [];
  const rows = list.map(it=>({
    車型: it.carModel, 品牌: "KYB", 總量: kybTotalQty(it), 儲位分布: kybLocSummary(it),
    訂價: it.listPrice!=null?it.listPrice:"", 牌價: it.catalogPrice!=null?it.catalogPrice:"",
    保修廠: it.warrantyPrice!=null?it.warrantyPrice:"", 備註: it.remark||""
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "資料");
  XLSX.writeFile(wb, `KYB庫存總表_篩選結果_${todayStr()}.xlsx`);
});

// ---------- KYB 進銷貨管理 ----------
document.getElementById("kybNewTxnBtn").addEventListener("click", openKybTxnModal);
document.getElementById("kybNewItemBtn").addEventListener("click", openNewKybItemModal);
document.getElementById("kybTxnFilterFrom").addEventListener("change", renderKybTxns);
document.getElementById("kybTxnFilterTo").addEventListener("change", renderKybTxns);
document.getElementById("kybTxnFilterSalesperson").addEventListener("input", renderKybTxns);
document.getElementById("kybTxnFilterCustomer").addEventListener("input", renderKybTxns);
document.getElementById("kybTxnFilterClearBtn").addEventListener("click", ()=>{
  document.getElementById("kybTxnFilterFrom").value = "";
  document.getElementById("kybTxnFilterTo").value = "";
  document.getElementById("kybTxnFilterSalesperson").value = "";
  document.getElementById("kybTxnFilterCustomer").value = "";
  renderKybTxns();
});

function renderKybTxns(){
  const body = document.getElementById("kybTxnBody");
  const from = document.getElementById("kybTxnFilterFrom").value;
  const to = document.getElementById("kybTxnFilterTo").value;
  const salesQ = norm(document.getElementById("kybTxnFilterSalesperson").value);
  const custQ = norm(document.getElementById("kybTxnFilterCustomer").value);

  let list = kybTxnCache.slice();
  if(from) list = list.filter(t=> t.date >= from);
  if(to) list = list.filter(t=> t.date <= to);
  if(salesQ) list = list.filter(t=> norm(t.salesperson || t.operator || "").includes(salesQ));
  if(custQ) list = list.filter(t=> norm(t.customerName || "").includes(custQ));

  document.getElementById("kybTxnCount").textContent = `共 ${list.length} 筆`;
  body.innerHTML = list.map(t=>{
    const item = kybItemsCache.find(i=>i.id===t.itemId);
    const label = item ? item.carModel : "(車型已刪除)";
    return `<tr>
      <td>${escapeHtml(t.date)}</td>
      <td>${t.type==='in'?'進貨':'銷貨'}</td>
      <td>${escapeHtml(label)}</td>
      <td>${t.qty}</td>
      <td>${escapeHtml(t.salesperson||"")}</td>
      <td>${escapeHtml(t.customerName||"")}</td>
      <td>${escapeHtml(t.operator||"")}</td>
      <td><button data-edit="${t.id}">編輯</button> <button data-del="${t.id}">刪除</button></td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="empty">尚無紀錄</td></tr>`;

  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=>editKybTxn(b.dataset.edit)));
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=>deleteKybTxn(b.dataset.del)));
}

function openKybTxnModal(){
  const html = `
    <div class="sheet-head"><h2>新增進貨／銷貨</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>類型</label>
      <select id="kybTxnType"><option value="in">進貨</option><option value="out">銷貨</option></select>
    </div>
    <div class="form-row">
      <label>搜尋車型</label>
      <input type="text" id="kybTxnItemSearch" placeholder="例如 Altis">
      <div class="autocomplete-list hidden" id="kybTxnItemList"></div>
    </div>
    <div class="form-row"><label>已選車型</label><input type="text" id="kybTxnItemLabel" disabled></div>
    <div class="form-row"><label>數量</label><input type="number" id="kybTxnQty" min="1"></div>
    <div class="form-row"><label>儲位</label>
      <select id="kybTxnLoc"><option value="">請先選擇車型</option></select>
    </div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="kybTxnSubmitBtn">確認送出</button>
    </div>`;
  openModal(html);
  let selectedItemId = null;

  function refreshLocOptions(){
    const type = document.getElementById("kybTxnType").value;
    const locSelect = document.getElementById("kybTxnLoc");
    const it = kybItemsCache.find(i=>i.id===selectedItemId);
    if(!it){ locSelect.innerHTML = `<option value="">請先選擇車型</option>`; return; }
    if(type === "out"){
      const options = kybLocList(it);
      window._kybTxnOutOptions = options;
      locSelect.innerHTML = options.length
        ? options.map((o,i)=>`<option value="${i}">${escapeHtml(o.code)}（目前${o.qty}）</option>`).join("")
        : `<option value="">這個車型目前沒有庫存可以出貨</option>`;
    } else {
      window._kybTxnOutOptions = [];
      locSelect.innerHTML = kybLocationsCache.map(l=>`<option value="${escapeHtml(l.code)}">${escapeHtml(l.code)}</option>`).join("");
    }
  }
  document.getElementById("kybTxnType").addEventListener("change", refreshLocOptions);

  const searchInput = document.getElementById("kybTxnItemSearch");
  searchInput.addEventListener("input", ()=>{
    const q = norm(searchInput.value);
    const listEl = document.getElementById("kybTxnItemList");
    if(!q){ listEl.classList.add("hidden"); return; }
    const matches = kybItemsCache.filter(it=> norm(it.carModel).includes(q)).slice(0,15);
    listEl.innerHTML = matches.map(it=>`<div data-id="${it.id}">${escapeHtml(it.carModel)}</div>`).join("");
    listEl.classList.toggle("hidden", matches.length===0);
    listEl.querySelectorAll("div").forEach(d=>d.addEventListener("click", ()=>{
      selectedItemId = d.dataset.id;
      const it = kybItemsCache.find(i=>i.id===selectedItemId);
      document.getElementById("kybTxnItemLabel").value = it.carModel;
      listEl.classList.add("hidden");
      searchInput.value = "";
      refreshLocOptions();
    }));
  });

  document.getElementById("kybTxnSubmitBtn").addEventListener("click", ()=>{
    if(!selectedItemId){ alert("請先搜尋並選擇一個車型"); return; }
    const type = document.getElementById("kybTxnType").value;
    const qty = Number(document.getElementById("kybTxnQty").value);
    if(!qty || qty<=0){ alert("請輸入正確的數量"); return; }

    let loc;
    if(type === "out"){
      const idx = Number(document.getElementById("kybTxnLoc").value);
      const opt = (window._kybTxnOutOptions||[])[idx];
      if(!opt){ alert("請選擇要出貨的儲位"); return; }
      loc = opt.code;
      if(qty > opt.qty){ alert(`這個儲位目前只有 ${opt.qty}，不能出貨 ${qty}`); return; }
    } else {
      loc = document.getElementById("kybTxnLoc").value;
      if(!loc){ alert("請選擇儲位"); return; }
    }
    submitKybTxn(selectedItemId, type, qty, loc);
  });
}

async function submitKybTxn(itemId, type, qty, loc){
  const itemRef = db.collection("kybItems").doc(itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data();
  const allLocs = {...(item.locations||{})};
  const cur = kybLocQty(allLocs[loc]);
  const next = type === "in" ? cur + qty : cur - qty;
  if(next < 0) throw new Error("庫存不足，無法出貨");
  if(next <= 0) delete allLocs[loc]; else allLocs[loc] = next;

  await itemRef.update({locations: allLocs});
  await db.collection("kybTransactions").add({
    itemId, type, qty, loc, date: todayStr(), operator: currentUser.name, editLog: []
  });
  closeModal();
}

async function editKybTxn(txnId){
  const t = kybTxnCache.find(x=>x.id===txnId);
  if(!t) return;
  const newQty = Number(prompt(`目前數量為 ${t.qty}，請輸入修正後的數量：`, t.qty));
  if(!newQty || newQty<=0) return;
  const diff = newQty - t.qty;
  const itemRef = db.collection("kybItems").doc(t.itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data();
  const allLocs = {...(item.locations||{})};
  const sign = t.type === "in" ? 1 : -1;
  const next = kybLocQty(allLocs[t.loc]) + diff*sign;
  if(next <= 0) delete allLocs[t.loc]; else allLocs[t.loc] = next;
  await itemRef.update({locations: allLocs});
  await db.collection("kybTransactions").doc(txnId).update({
    qty: newQty,
    editLog: firebase.firestore.FieldValue.arrayUnion({
      before: t.qty, after: newQty, time: new Date().toISOString(), by: currentUser.name
    })
  });
}

async function deleteKybTxn(txnId){
  const t = kybTxnCache.find(x=>x.id===txnId);
  if(!t) return;
  if(!confirm("確定要刪除這筆紀錄嗎？（會自動把庫存改回去）")) return;
  const itemRef = db.collection("kybItems").doc(t.itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data();
  const allLocs = {...(item.locations||{})};
  const sign = t.type === "in" ? -1 : 1;
  const next = kybLocQty(allLocs[t.loc]) + t.qty*sign;
  if(next <= 0) delete allLocs[t.loc]; else allLocs[t.loc] = next;
  await itemRef.update({locations: allLocs});
  await db.collection("kybTransactions").doc(txnId).delete();
}

function openNewKybItemModal(){
  const html = `
    <div class="sheet-head"><h2>新增車型</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>車型</label><input type="text" id="newKybModel" placeholder="例如 Altis '19~"></div>
    <div class="form-row"><label>訂價</label><input type="number" id="newKybListPrice"></div>
    <div class="form-row"><label>牌價</label><input type="number" id="newKybCatalogPrice"></div>
    <div class="form-row"><label>保修廠</label><input type="number" id="newKybWarrantyPrice"></div>
    <div class="form-row"><label>備註</label><input type="text" id="newKybRemark"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="newKybSubmitBtn">建立車型</button>
    </div>`;
  openModal(html);
  document.getElementById("newKybSubmitBtn").addEventListener("click", async ()=>{
    const carModel = document.getElementById("newKybModel").value.trim();
    if(!carModel){ alert("請輸入車型"); return; }
    const toNum = (id)=>{ const v = document.getElementById(id).value; return v===""?null:Number(v); };
    await db.collection("kybItems").add({
      carModel, brand:"KYB", remark: document.getElementById("newKybRemark").value.trim(),
      locations:{}, listPrice: toNum("newKybListPrice"), catalogPrice: toNum("newKybCatalogPrice"), warrantyPrice: toNum("newKybWarrantyPrice")
    });
    closeModal();
  });
}

// ---------- KYB 訂單管理 ----------
function renderKybOrders(){
  const body = document.getElementById("kybOrdersBody");
  if(!body) return;
  document.getElementById("kybOrdersCount").textContent = `共 ${kybOrdersCache.length} 筆待確認`;
  const sorted = kybOrdersCache.slice().sort((a,b)=> (a.requestedAt||"").localeCompare(b.requestedAt||""));
  body.innerHTML = sorted.map(o=>`<tr>
    <td>${escapeHtml((o.requestedAt||"").slice(0,16).replace("T"," "))}</td>
    <td>${escapeHtml(o.requestedByName||"")}</td>
    <td>${escapeHtml(o.itemLabel||"")}</td>
    <td>${o.qty}</td>
    <td>${o.loc?escapeHtml(o.loc):'<span class="empty-inline">未選</span>'}</td>
    <td>${escapeHtml(o.customerName||"")}</td>
    <td>${escapeHtml(o.customerContact||"")}</td>
    <td>${escapeHtml(o.customerNote||"")}</td>
    <td>
      <button data-confirm="${o.id}">確認</button>
      <button data-edit="${o.id}">修改</button>
      <button data-cancel="${o.id}">取消</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="9" class="empty">目前沒有待確認訂單</td></tr>`;

  body.querySelectorAll("[data-confirm]").forEach(b=>b.addEventListener("click", ()=> openConfirmKybOrderModal(b.dataset.confirm)));
  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=> openEditKybOrderModal(b.dataset.edit)));
  body.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click", ()=> cancelKybOrder(b.dataset.cancel)));
}

function openConfirmKybOrderModal(orderId){
  const order = kybOrdersCache.find(o=>o.id===orderId);
  if(!order) return;
  const item = kybItemsCache.find(i=>i.id===order.itemId);
  if(!item){ alert("找不到這個車型，可能已被刪除。請改用「修改」換一個車型，或直接取消這筆訂單。"); return; }
  const options = kybLocList(item);
  if(options.length === 0){ alert("這個車型目前沒有庫存可以出貨，請先確認庫存，或取消這筆訂單。"); return; }

  let defaultIdx = options.findIndex(o=> o.code === order.loc);
  if(defaultIdx < 0) defaultIdx = 0;
  const employeePickNote = order.loc
    ? `<div class="note" style="background:#eef4ff;color:#2451a3;">員工原本選擇：${escapeHtml(order.loc)}，如需要可在下方改選其他儲位。</div>`
    : "";
  const html = `
    <div class="sheet-head"><h2>確認出貨：${escapeHtml(order.itemLabel||"")}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>客戶</label><input type="text" value="${escapeHtml(order.customerName||'')}（${escapeHtml(order.customerContact||'')}）" disabled></div>
    <div class="form-row"><label>數量</label><input type="text" value="${order.qty}" disabled></div>
    ${employeePickNote}
    <div class="form-row"><label>選擇要出貨的儲位</label>
      <select id="kybConfirmLoc">${options.map((o,i)=>`<option value="${i}" ${i===defaultIdx?'selected':''}>${escapeHtml(o.code)}（目前${o.qty}）</option>`).join("")}</select>
    </div>
    <div class="count" id="kybConfirmStockWarn" style="color:#a31e22;"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="kybConfirmOrderSubmitBtn">確認出貨</button>
    </div>`;
  openModal(html);

  function refreshWarn(){
    const idx = Number(document.getElementById("kybConfirmLoc").value);
    const opt = options[idx];
    document.getElementById("kybConfirmStockWarn").textContent =
      (opt && order.qty > opt.qty) ? `⚠ 這個儲位目前只有 ${opt.qty}，不夠出 ${order.qty}，請選別的儲位或先用「修改」調整數量` : "";
  }
  document.getElementById("kybConfirmLoc").addEventListener("change", refreshWarn);
  refreshWarn();

  document.getElementById("kybConfirmOrderSubmitBtn").addEventListener("click", async ()=>{
    const idx = Number(document.getElementById("kybConfirmLoc").value);
    const opt = options[idx];
    if(!opt){ alert("請選擇儲位"); return; }
    if(order.qty > opt.qty){ alert(`這個儲位目前只有 ${opt.qty}，不夠出 ${order.qty}，請選別的儲位，或先用「修改」調整這筆訂單的數量`); return; }
    try{
      const txnRef = await submitKybOrderTxn(order, opt.code);
      await db.collection("kybOrders").doc(order.id).update({
        status: "confirmed", confirmedAt: new Date().toISOString(), confirmedBy: currentUser.name, linkedTxnId: txnRef.id
      });
      closeModal();
    }catch(e){
      alert("確認失敗："+e.message);
    }
  });
}

async function submitKybOrderTxn(order, loc){
  const itemRef = db.collection("kybItems").doc(order.itemId);
  const itemSnap = await itemRef.get();
  const item = itemSnap.data();
  const allLocs = {...(item.locations||{})};
  const cur = kybLocQty(allLocs[loc]);
  if(cur < order.qty) throw new Error("這個儲位庫存不足，請重新選擇");
  const next = cur - order.qty;
  if(next <= 0) delete allLocs[loc]; else allLocs[loc] = next;
  await itemRef.update({locations: allLocs});
  return await db.collection("kybTransactions").add({
    itemId: order.itemId, type: "out", qty: order.qty, loc,
    date: todayStr(), operator: currentUser.name,
    salesperson: order.requestedByName || "", customerName: order.customerName || "",
    customerContact: order.customerContact || "", customerNote: order.customerNote || "",
    orderId: order.id, editLog: []
  });
}

function openEditKybOrderModal(orderId){
  const order = kybOrdersCache.find(o=>o.id===orderId);
  if(!order) return;
  let selectedItemId = order.itemId;
  const html = `
    <div class="sheet-head"><h2>修改訂單</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row">
      <label>搜尋車型（要換車型才需要，不換不用理它）</label>
      <input type="text" id="editKybOrderItemSearch" placeholder="例如 Altis">
      <div class="autocomplete-list hidden" id="editKybOrderItemList"></div>
    </div>
    <div class="form-row"><label>目前車型</label><input type="text" id="editKybOrderItemLabel" value="${escapeHtml(order.itemLabel||'')}" disabled></div>
    <div class="form-row"><label>選擇儲位</label><select id="editKybOrderLoc"></select></div>
    <div class="form-row"><label>數量</label><input type="number" id="editKybOrderQty" min="1" value="${order.qty}"></div>
    <div class="form-row"><label>客戶姓名</label><input type="text" id="editKybOrderCustomerName" value="${escapeHtml(order.customerName||'')}"></div>
    <div class="form-row"><label>聯絡方式</label><input type="text" id="editKybOrderCustomerContact" value="${escapeHtml(order.customerContact||'')}"></div>
    <div class="form-row"><label>備註</label><input type="text" id="editKybOrderCustomerNote" value="${escapeHtml(order.customerNote||'')}"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="editKybOrderSaveBtn">儲存</button>
    </div>`;
  openModal(html);

  let locOptions = [];
  function refreshEditLocOptions(){
    const it = kybItemsCache.find(i=>i.id===selectedItemId);
    locOptions = it ? kybLocList(it) : [];
    const locSelect = document.getElementById("editKybOrderLoc");
    if(locOptions.length === 0){ locSelect.innerHTML = `<option value="">目前無庫存</option>`; return; }
    let defaultIdx = locOptions.findIndex(o=> o.code === order.loc);
    if(defaultIdx < 0) defaultIdx = 0;
    locSelect.innerHTML = locOptions.map((o,i)=>`<option value="${i}" ${i===defaultIdx?'selected':''}>${escapeHtml(o.code)}（目前${o.qty}）</option>`).join("");
  }
  refreshEditLocOptions();

  const searchInput = document.getElementById("editKybOrderItemSearch");
  searchInput.addEventListener("input", ()=>{
    const q = norm(searchInput.value);
    const listEl = document.getElementById("editKybOrderItemList");
    if(!q){ listEl.classList.add("hidden"); return; }
    const matches = kybItemsCache.filter(it=> norm(it.carModel).includes(q)).slice(0,15);
    listEl.innerHTML = matches.map(it=>`<div data-id="${it.id}">${escapeHtml(it.carModel)}</div>`).join("");
    listEl.classList.toggle("hidden", matches.length===0);
    listEl.querySelectorAll("div").forEach(d=>d.addEventListener("click", ()=>{
      selectedItemId = d.dataset.id;
      const it = kybItemsCache.find(i=>i.id===selectedItemId);
      document.getElementById("editKybOrderItemLabel").value = it.carModel;
      listEl.classList.add("hidden");
      searchInput.value = "";
      refreshEditLocOptions();
    }));
  });

  document.getElementById("editKybOrderSaveBtn").addEventListener("click", async ()=>{
    const qty = Number(document.getElementById("editKybOrderQty").value);
    const customerName = document.getElementById("editKybOrderCustomerName").value.trim();
    const customerContact = document.getElementById("editKybOrderCustomerContact").value.trim();
    const customerNote = document.getElementById("editKybOrderCustomerNote").value.trim();
    if(!qty || qty<=0){ alert("請輸入正確的數量"); return; }
    const it = kybItemsCache.find(i=>i.id===selectedItemId);
    const itemLabel = it ? `${it.carModel}（KYB）` : order.itemLabel;
    const locIdx = Number(document.getElementById("editKybOrderLoc").value);
    const locOpt = locOptions[locIdx];
    try{
      await db.collection("kybOrders").doc(orderId).update({
        itemId: selectedItemId, itemLabel, qty, customerName, customerContact, customerNote,
        loc: locOpt ? locOpt.code : null
      });
      closeModal();
    }catch(e){
      alert("儲存失敗："+e.message);
    }
  });
}

function cancelKybOrder(orderId){
  if(!confirm("確定要取消這筆訂單嗎？")) return;
  db.collection("kybOrders").doc(orderId).update({
    status: "cancelled", cancelledAt: new Date().toISOString(), cancelledBy: currentUser.name
  }).catch(e=>alert("取消失敗："+e.message));
}

// ---------- KYB 我的訂單 ----------
function renderKybMyOrders(){
  const body = document.getElementById("kybMyOrdersBody");
  if(!body) return;
  const sorted = kybMyOrdersCache.slice().sort((a,b)=> (b.requestedAt||"").localeCompare(a.requestedAt||""));
  document.getElementById("kybMyOrdersCount").textContent = `共 ${sorted.length} 筆`;
  const statusLabel = { pending:"待確認", confirmed:"已出貨", cancelled:"已取消" };
  body.innerHTML = sorted.map(o=>`<tr>
    <td>${escapeHtml((o.requestedAt||"").slice(0,16).replace("T"," "))}</td>
    <td>${escapeHtml(o.itemLabel||"")}</td>
    <td>${o.qty}</td>
    <td>${escapeHtml(o.customerName||"")}</td>
    <td>${statusLabel[o.status]||o.status}</td>
  </tr>`).join("") || `<tr><td colspan="5" class="empty">尚無訂單紀錄</td></tr>`;
}

// ---------- KYB 儲位管理 ----------
document.getElementById("kybAddLocBtn").addEventListener("click", async ()=>{
  const code = document.getElementById("kybNewLocInput").value.trim();
  if(!code){ alert("請輸入儲位代碼"); return; }
  if(kybLocationsCache.some(l=>l.code===code)){ alert("這個儲位代碼已經存在"); return; }
  await db.collection("kybLocations").add({code});
  document.getElementById("kybNewLocInput").value = "";
});

function renderKybLocations(){
  const body = document.getElementById("kybLocBody");
  body.innerHTML = kybLocationsCache.map(l=>
    `<tr><td>${escapeHtml(l.code)}</td><td><button data-del="${l.id}" data-code="${escapeHtml(l.code)}">刪除</button></td></tr>`
  ).join("") || `<tr><td colspan="2" class="empty">尚無儲位</td></tr>`;
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=>deleteKybLocation(b.dataset.del, b.dataset.code)));
}

function deleteKybLocation(locId, code){
  const blocking = kybItemsCache.filter(it=> kybLocQty((it.locations||{})[code]) > 0);
  if(blocking.length){
    const detail = blocking.map(it=>`${it.carModel}：${kybLocQty(it.locations[code])}`).join("\n");
    alert(`這個儲位還有庫存，無法直接刪除。請先把以下車型搬到其他儲位：\n\n${detail}`);
    return;
  }
  if(confirm(`確定要刪除儲位「${code}」嗎？`)){
    db.collection("kybLocations").doc(locId).delete();
  }
}

// ============================================================
// 共用 Modal
// ============================================================
// 手機上（尤其iOS Safari）打開鍵盤時，如果背景頁面還能滾動，畫面常常會整個跑掉、歪掉。
// 開啟視窗時把背景頁面「鎖住」（position:fixed），關閉時再還原到原本捲動位置，畫面就不會亂跳。
function openModal(html){
  document.getElementById("modalSheet").innerHTML = html;
  document.getElementById("modalOverlay").classList.remove("hidden");
  const scrollY = window.scrollY;
  document.body.dataset.scrollY = scrollY;
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = "100%";
}
function closeModal(){
  document.getElementById("modalOverlay").classList.add("hidden");
  document.getElementById("modalSheet").innerHTML = "";
  const scrollY = Number(document.body.dataset.scrollY || 0);
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  window.scrollTo(0, scrollY);
}
document.getElementById("modalOverlay").addEventListener("click", (e)=>{
  if(e.target.id === "modalOverlay") closeModal();
});
