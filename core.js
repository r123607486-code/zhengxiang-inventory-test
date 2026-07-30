// ============================================================
// 正享有限公司庫存管理系統 — 共用核心（常數／狀態／工具函式／登入／分類切換／分頁／監聽器啟動）
// ============================================================

// 效期反紅：改為由使用者在「庫存總表」頁面點擊選擇門檻年限（1-9年）才會反紅，不再自動顯示。
const DEFAULT_BRANDS = [
  "賽輪Sailun","韓泰Hankook","阿基里斯Achilles","安馳ANCHEE","薩馳輪胎ARDUZZA",
  "黑獅輪胎Blacklion","庫斯通KUSTONE","牛頓輪胎NEUTON","尼克森NEXEN",
  "路德斯通ROAD.STONE","萬峰馳輪胎WINDFORCE","薩提諾ZESTINO"
];

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

const CATEGORY_ICONS = {
  tire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/><line x1="12" y1="3" x2="12" y2="6.2"/><line x1="12" y1="17.8" x2="12" y2="21"/><line x1="3" y1="12" x2="6.2" y2="12"/><line x1="17.8" y1="12" x2="21" y2="12"/></svg>',
  kyb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="2" x2="12" y2="8"/><rect x="8.5" y="8" width="7" height="10" rx="1.5"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="9" y1="10.5" x2="15" y2="10.5"/><line x1="9" y1="13.5" x2="15" y2="13.5"/></svg>'
};

let currentUser = null;
let currentCategory = null;
let itemsCache = [];
let locationsCache = [];
let usersCache = [];
let txnCache = [];
let brandsCache = [];
let ordersCache = [];
let myOrdersCache = [];

let kybItemsCache = [];
let kybLocationsCache = [];
let kybOrdersCache = [];
let kybMyOrdersCache = [];
let kybTxnCache = [];
let usersListenerStarted = false;
let tireListenersStarted = false;
let kybListenersStarted = false;
let queryVisibleCount = 200;
let kybQueryVisibleCount = 200;

function norm(s){ return (s || "").toString().toUpperCase().replace(/\s+/g, ""); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function monthsBetween(dateStr){
  if(!dateStr) return null;
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(String(dateStr).trim());
  if(!m) return null;
  const year = Number(m[1]);
  if(year < 2015 || year > 2035) return null;
  const d = new Date(year, Number(m[2])-1, Number(m[3]));
  if(isNaN(d)) return null;
  const now = new Date();
  return (now.getFullYear()-d.getFullYear())*12 + (now.getMonth()-d.getMonth());
}

function isoWeekToDate(year, week){
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = (jan4.getUTCDay() + 6) % 7;
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
  const year = 2000 + yy;
  if(year < 2015 || year > 2035) return null;
  const d = isoWeekToDate(year, week);
  if(isNaN(d)) return null;
  const now = new Date();
  return (now.getFullYear() - d.getUTCFullYear()) * 12 + (now.getMonth() - d.getUTCMonth());
}
function normalizeBatches(raw, item){
  if(raw == null) return [];
  if(Array.isArray(raw)) return raw.map(b=>({ qty: Number(b&&b.qty)||0, productionDate: (b&&b.productionDate) || null }));
  if(typeof raw === "object") return [{ qty: Number(raw.qty)||0, productionDate: raw.productionDate || (item && item.productionDate) || null }];
  return [{ qty: Number(raw)||0, productionDate: (item && item.productionDate) || null }];
}
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
const PENDING_STOCK_CODE = "尚未入庫";
function hasPendingStock(item){
  return locQty((item.locations||{})[PENDING_STOCK_CODE]) > 0;
}
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
function kybHasPendingStock(item){
  return kybLocQty((item.locations||{})[PENDING_STOCK_CODE]) > 0;
}

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

document.getElementById("categoryIconTire").innerHTML = CATEGORY_ICONS.tire;
document.getElementById("categoryIconKyb").innerHTML = CATEGORY_ICONS.kyb;

function showCategoryScreen(){
  document.getElementById("app").classList.add("hidden");
  document.getElementById("categoryScreen").classList.remove("hidden");
}

function switchToCategory(cat){
  currentCategory = cat;
  document.getElementById("categoryScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("appTitle").textContent =
    "正享庫存管理系統｜" + (currentCategory === "kyb" ? "KYB避震器" : "輪胎");
  buildTabs();
  checkFridayBanner();
  startListeners();
}

document.querySelectorAll(".category-card").forEach(btn=>{
  btn.addEventListener("click", ()=> switchToCategory(btn.dataset.category));
});

document.getElementById("switchCategoryBtn").addEventListener("click", ()=>{
  showCategoryScreen();
});

const TIRE_TAB_DEFS = [
  {id:"query",    label:"庫存查詢", icon:ICONS.query,   roles:["admin","member"]},
  {id:"myorders", label:"我的訂單", icon:ICONS.myorders,roles:["member"]},
  {id:"master",   label:"庫存總表", icon:ICONS.master,  roles:["admin","member"]},
  {id:"txn",      label:"進銷貨管理", icon:ICONS.txn,   roles:["admin","member"]},
  {id:"orders",   label:"訂單管理", icon:ICONS.orders,  roles:["admin"]},
  {id:"loc",      label:"儲位管理", icon:ICONS.loc,     roles:["admin"]},
  {id:"import",   label:"資料匯入", icon:ICONS.txn,     roles:["admin"]},
  {id:"users",    label:"使用者管理", icon:ICONS.users, roles:["admin"]},
];
const KYB_TAB_DEFS = [
  {id:"kyb-query",    label:"庫存查詢", icon:ICONS.query,   roles:["admin","member"]},
  {id:"kyb-myorders", label:"我的訂單", icon:ICONS.myorders,roles:["member"]},
  {id:"kyb-master",   label:"庫存總表", icon:ICONS.master,  roles:["admin","member"]},
  {id:"kyb-txn",      label:"進銷貨管理", icon:ICONS.txn,   roles:["admin","member"]},
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

function updateStickyOffsets(){
  const headerEl = document.querySelector("header.topbar");
  const navEl = document.getElementById("tabs");
  if(!headerEl || !navEl) return;
  document.documentElement.style.setProperty("--header-h", headerEl.offsetHeight + "px");
  document.documentElement.style.setProperty("--nav-h", navEl.offsetHeight + "px");
}
window.addEventListener("resize", updateStickyOffsets);
window.addEventListener("load", ()=> setTimeout(updateStickyOffsets, 100));

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

function startListeners(){
  if(!usersListenerStarted && currentUser.role === "admin"){
    usersListenerStarted = true;
    db.collection("users").onSnapshot(snap=>{
      usersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderUsers();
    });
  }
  if(currentUser.role === "admin"){
    if(!tireListenersStarted){ tireListenersStarted = true; startTireListeners(); }
    if(!kybListenersStarted){ kybListenersStarted = true; startKybListeners(); }
  } else if(currentCategory === "kyb"){
    if(!kybListenersStarted){ kybListenersStarted = true; startKybListeners(); }
  } else {
    if(!tireListenersStarted){ tireListenersStarted = true; startTireListeners(); }
  }
}

function startRealtimeListener(makeQuery, onData, label){
  const subscribe = ()=>{
    makeQuery().onSnapshot(onData, error=>{
      console.error("[" + label + "] 即時同步失敗：", error);
      window.setTimeout(subscribe, 3000);
    });
  };
  subscribe();
}

async function refreshTireViews(){
  const [itemsSnap, txnsSnap] = await Promise.all([
    db.collection("items").get(),
    db.collection("transactions").orderBy("date","desc").limit(200).get()
  ]);
  itemsCache = itemsSnap.docs.map(d=>({id:d.id, ...d.data()}));
  txnCache = txnsSnap.docs.map(d=>({id:d.id, ...d.data()}));
  renderQuery(); renderMaster(); renderTxns();
}

async function refreshKybViews(){
  const [itemsSnap, txnsSnap] = await Promise.all([
    db.collection("kybItems").get(),
    db.collection("kybTransactions").orderBy("date","desc").limit(200).get()
  ]);
  kybItemsCache = itemsSnap.docs.map(d=>({id:d.id, ...d.data()}));
  kybTxnCache = txnsSnap.docs.map(d=>({id:d.id, ...d.data()}));
  renderKybQuery(); renderKybMaster(); renderKybTxns();
}
function startTireListeners(){
  startRealtimeListener(()=>db.collection("items"), snap=>{
    itemsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderQuery(); renderMaster();
  }, "tire items");
  startRealtimeListener(()=>db.collection("locations"), snap=>{
    locationsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderLocations();
  }, "tire locations");
  startRealtimeListener(()=>db.collection("transactions").orderBy("date","desc").limit(200), snap=>{
    txnCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderTxns();
  }, "tire transactions");
  if(currentUser.role === "admin"){
    db.collection("orders").where("status","==","pending").onSnapshot(snap=>{
      ordersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderOrders();
      updateOrdersBadge();
    });
  } else {
    let myOrdersByUid = [], myOrdersByName = [];
    const refreshMyOrders = ()=>{
      const merged = new Map([...myOrdersByName, ...myOrdersByUid].map(o=>[o.id, o]));
      myOrdersCache = [...merged.values()];
      renderMyOrders();
    };
    db.collection("orders").where("requestedByUid","==",currentUser.uid).onSnapshot(snap=>{
      myOrdersByUid = snap.docs.map(d=>({id:d.id, ...d.data()}));
      refreshMyOrders();
    });
    db.collection("orders").where("requestedByName","==",currentUser.name).onSnapshot(snap=>{
      myOrdersByName = snap.docs.map(d=>({id:d.id, ...d.data()}));
      refreshMyOrders();
    });
  }
  db.collection("brands").onSnapshot(snap=>{
    brandsCache = snap.docs.map(d=>d.data().name);
    if(brandsCache.length === 0) brandsCache = DEFAULT_BRANDS.slice();
  }, ()=>{ brandsCache = DEFAULT_BRANDS.slice(); });
}

function startKybListeners(){
  startRealtimeListener(()=>db.collection("kybItems"), snap=>{
    kybItemsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderKybQuery(); renderKybMaster();
  }, "kyb items");
  startRealtimeListener(()=>db.collection("kybLocations"), snap=>{
    kybLocationsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderKybLocations();
  }, "kyb locations");
  startRealtimeListener(()=>db.collection("kybTransactions").orderBy("date","desc").limit(200), snap=>{
    kybTxnCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderKybTxns();
  }, "kyb transactions");
  if(currentUser.role === "admin"){
    db.collection("kybOrders").where("status","==","pending").onSnapshot(snap=>{
      kybOrdersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderKybOrders();
      updateKybOrdersBadge();
    });
  } else {
    let myKybOrdersByUid = [], myKybOrdersByName = [];
    const refreshMyKybOrders = ()=>{
      const merged = new Map([...myKybOrdersByName, ...myKybOrdersByUid].map(o=>[o.id, o]));
      kybMyOrdersCache = [...merged.values()];
      renderKybMyOrders();
    };
    db.collection("kybOrders").where("requestedByUid","==",currentUser.uid).onSnapshot(snap=>{
      myKybOrdersByUid = snap.docs.map(d=>({id:d.id, ...d.data()}));
      refreshMyKybOrders();
    });
    db.collection("kybOrders").where("requestedByName","==",currentUser.name).onSnapshot(snap=>{
      myKybOrdersByName = snap.docs.map(d=>({id:d.id, ...d.data()}));
      refreshMyKybOrders();
    });
  }
}

function updateOrdersBadge(){
  const badge = document.getElementById("ordersTabBadge");
  const n = ordersCache.length;
  if(badge){ badge.textContent = n; badge.classList.toggle("hidden", n===0); }
  updateOrdersBannerCombined();
}
document.getElementById("dismissOrdersBanner").addEventListener("click", ()=>{
  const banner = document.getElementById("ordersBanner");
  const target = (banner && banner.dataset.targetCategory) || currentCategory;
  if(target && target !== currentCategory) switchToCategory(target);
  const tabId = target === "kyb" ? "kyb-orders" : "orders";
  const btn = document.querySelector(`nav.tabs button[data-tab="${tabId}"]`);
  if(btn) btn.click();
});

function updateKybOrdersBadge(){
  const badge = document.getElementById("kybOrdersTabBadge");
  const n = kybOrdersCache.length;
  if(badge){ badge.textContent = n; badge.classList.toggle("hidden", n===0); }
  updateOrdersBannerCombined();
}

function updateOrdersBannerCombined(){
  const banner = document.getElementById("ordersBanner");
  const bannerText = document.getElementById("ordersBannerText");
  if(!banner || !bannerText) return;
  const tireN = ordersCache.length;
  const kybN = kybOrdersCache.length;
  if(tireN === 0 && kybN === 0){ banner.classList.add("hidden"); return; }
  const parts = [];
  if(tireN > 0) parts.push(`輪胎 ${tireN} 筆`);
  if(kybN > 0) parts.push(`KYB ${kybN} 筆`);
  bannerText.textContent = `有新訂單待確認：${parts.join("、")}`;
  const otherCategory = currentCategory === "kyb" ? "tire" : "kyb";
  const otherN = otherCategory === "kyb" ? kybN : tireN;
  banner.dataset.targetCategory = otherN > 0 ? otherCategory : currentCategory;
  banner.classList.remove("hidden");
}
