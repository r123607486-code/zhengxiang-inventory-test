// ============================================================
// 正享有限公司庫存管理系統 — 主程式
// Phase 1：登入分權 / 庫存查詢 / 進銷貨管理(手動輸入) / 儲位管理 / 庫存總表 / 使用者管理
// ============================================================

// 效期反紅：改為由使用者在「庫存總表」頁面點擊選擇門櫃年限（1-9年）才會反紅，不再自動顯示。
const DEFAULT_BRANDS = [
  "賣輪Sailun","韓泰Hankook","阿基里斯Achilles","安馳ANCHEE","薩馳輪胎ARDUZZA",
  "黑獄輪胎Blacklion","庫斯通KUSTONE","牛頓輪胎NEUTON","尼克NEXEN",
  "路德斯通ROAD.STONE","萬峰馳輪胎WINDFORCE","薩提諾ZESTINO"
];

// 小圖示（inline SVG，不需要額外的圖示字體或CDN）
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

let currentUser = null; // {uid, name, username, role}
let itemsCache = [];
let locationsCache = [];
let usersCache = [];
let txnCache = [];
let brandsCache = [];
let ordersCache = [];   // 管理者用：目前所有「待確認」的訂單
let myOrdersCache = []; // 員工用：自己下過的全部訂單（含待確認/已出貨/已取消）

// ---------- 工具函式 ----------
function norm(s){ return (s || "").toString().toUpperCase().replace(/\s+/g, ""); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
// 舊版依標準日期(YYYY-MM-DD)算月份，仍保留給「進貨時填的生產日期」使用（如果之後有人改用標準格式填寫）。
function monthsBetween(dateStr){
  if(!dateStr) return null;
  const m = /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/.exec(String(dateStr).trim());
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
  const year = 2000 + yy; // 假設都是西儃2000年後生產
  if(year < 2015 || year > 2035) return null; // 年分不合理，視為無效代碼
  const d = isoWeekToDate(year, week);
  if(isNaN(d)) return null;
  const now = new Date();
  return (now.getFullYear() - d.getUTCFullYear()) * 12 + (now.getMonth() - d.getUTCMonth());
}
// 儲位資料格式：{ 儲位代碼: [ {qty, productionDate}, ... ] }——每個儲位底下可以有好幾批不同生產日期的庫存，
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
// 回傳這個品項底下每一批（每個儲位×每個生產日期）的明細：[{code, idx, qty, date}]，idx是這一批在該儲位陣列裡的位置
// 依儲位代碼、生產日期排序；同一個儲位如果有兩批不同生產日期，會各自變成狜立一行，不會混在一起
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
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("whoLabel").textContent = `${currentUser.name}（${currentUser.role==='admin'?'管理者':'員工'}）`;
  buildTabs();
  checkFridayBanner();
  startListeners();
});

// ---------- 分頁(Tabs) ----------
const TAB_DEFS = [
  {id:"query",    label:"庫存查詢", icon:ICONS.query,   roles:["admin","member"]},
  {id:"myorders", label:"我的訂單", icon:ICONS.myorders,roles:["member"]},
  {id:"master",   label:"庫存總表", icon:ICONS.master,  roles:["admin"]},
  {id:"txn",      label:"進銷貨管理", icon:ICONS.txn,   roles:["admin"]},
  {id:"orders",   label:"訂單管理", icon:ICONS.orders,  roles:["admin"]},
  {id:"loc",      label:"儲位管理", icon:ICONS.loc,     roles:["admin"]},
  {id:"import",   label:"資料匯入", icon:ICONS.txn,     roles:["admin"]},
  {id:"users",    label:"使用者管理", icon:ICONS.users, roles:["admin"]},
];

function buildTabs(){
  const nav = document.getElementById("tabs");
  const visible = TAB_DEFS.filter(t=>t.roles.includes(currentUser.role));
  nav.innerHTML = visible.map((t,i)=>
    `<button data-tab="${t.id}" class="${i===0?'active':''}">${t.icon}${t.label}${t.id==='orders'?'<span class="badge-dot hidden" id="ordersTabBadge">0</span>':''}</button>`
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
function startListeners(){
  db.collection("items").onSnapshot(snap=>{
    itemsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderQuery(); renderMaster();
  });
  db.collection("locations").onSnapshot(snap=>{
    locationsCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
    renderLocations();
  });
  if(currentUser.role === "admin"){
    db.collection("users").onSnapshot(snap=>{
      usersCache = snap.docs.map(d=>({id:d.id, ...d.data()}));
      renderUsers();
    });
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

// 有新訂單待確認時，讓管理者不管在哪一頁都能馬上看到（畫面上方横幅 + 分頁按鈕上的紅點數字）
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
  const btn = document.querySelector('nav.tabs button[data-tab="orders"]');
  if(btn) btn.click();
});

// ============================================================
// 庫存查詢
// ============================================================
document.getElementById("queryBox").addEventListener("input", renderQuery);

function renderQuery(){
  const box = document.getElementById("queryResults");
  const countEl = document.getElementById("queryCount");
  const q = norm(document.getElementById("queryBox").value);

  let list = itemsCache.filter(it=> totalQty(it) > 0);
  if(q) list = list.filter(it=> norm(it.spec).includes(q) || norm(it.model).includes(q) || norm(it.brand).includes(q));

  countEl.textContent = q ? `找到 ${list.length} 筆` : `共 ${list.length} 筆可售品項`;

  box.innerHTML = list.slice(0,200).map(it=>{
    return `<div class="card">
      <div class="code-row">
        <div class="code">${escapeHtml(it.spec)}</div>
        <button class="order-btn" data-id="${it.id}">${ICONS.cart}叫貨</button>
      </div>
      <div class="sub">${escapeHtml(it.brand)}　${escapeHtml(it.model||"")}</div>
      <div class="qty">庫存 ${totalQty(it)}${it.cost!=null?`　　成本 ${it.cost}`:""}</div>
      <div class="sub">儲位：${escapeHtml(locSummary(it))}</div>
    </div>`;
  }).join("") || `<div class="empty">查無符合的可售品項</div>`;

  box.querySelectorAll(".order-btn").forEach(b=>{
    b.addEventListener("click", ()=> openOrderModal(b.dataset.id));
  });
}

// 員工在庫存查詢頁點「叫貨」：選數量、填客戶資訊，送出後只建立一筆「待確認」訂單，不會馬上扣庫存
function openOrderModal(itemId){
  const item = itemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const avail = totalQty(item);
  const html = `
    <div class="sheet-head"><h2>叫貨：${escapeHtml(item.spec)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>品牌／型號</label><input type="text" value="${escapeHtml(item.brand)} ${escapeHtml(item.model||'')}" disabled></div>
    <div class="form-row"><label>目前庫存</label><input type="text" value="${avail}" disabled></div>
    <div class="form-row"><label>數量</label>
      <select id="orderQty">${avail>0 ? Array.from({length:avail},(_,i)=>i+1).map(n=>`<option value="${n}">${n}</option>`).join("") : `<option value="0">目前無庫存</option>`}</select>
    </div>
    <div class="form-row"><label>客戶姓名</label><input type="text" id="orderCustomerName"></div>
    <div class="form-row"><label>聯絡方式</label><input type="text" id="orderCustomerContact"></div>
    <div class="form-row"><label>備註</label><input type="text" id="orderCustomerNote"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="orderSubmitBtn">送出叫貨</button>
    </div>`;
  openModal(html);

  document.getElementById("orderSubmitBtn").addEventListener("click", async ()=>{
    const qty = Number(document.getElementById("orderQty").value);
    const customerName = document.getElementById("orderCustomerName").value.trim();
    const customerContact = document.getElementById("orderCustomerContact").value.trim();
    const customerNote = document.getElementById("orderCustomerNote").value.trim();
    if(!qty || qty<=0){ alert("請輸入正確的數量"); return; }
    if(qty > avail){ alert(`目前庫存只有 ${avail}，不能叫超過這個數量`); return; }
    if(!customerName){ alert("請輸入客戶姓名"); return; }
    try{
      await db.collection("orders").add({
        itemId: item.id,
        itemLabel: `${item.brand} ${item.spec}（${item.model||""}）`,
        qty, customerName, customerContact, customerNote,
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
let masterExpireYears = null; // null=未套用反紅；1-9=套用中的門櫃年限
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

  document.getElementById("masterCount").textContent = `共 ${list.length} 筆`
    + (masterExpireYears ? `　（反紅門櫃：超過 ${masterExpireYears} 年）` : "");

  const body = document.getElementById("masterBody");
  body.innerHTML = list.map(it=>{
    // 反紅邏輯：只要某個儲位的生產日期能被解析成合法的4碼DOT代碼（週+年），就直接拿來判斷；
    // 無法解析（像「926」這种3碼、或格式不對的舊年分代碼）一律當作「無法判定」，不會反紅、不會用猜的。
    const details = locDetailList(it).map(d=>{
      let expired = false;
      if(masterExpireYears){
        const m = tireCodeMonthsAgo(d.date);
        expired = m !== null && m > masterExpireYears * 12;
      }
      return {...d, expired};
    });
    const rowExpired = details.some(d=>d.expired);
    const locHtml = details.length
      ? details.map(d=>`<div class="loc-line${d.expired?' loc-expired':''}" data-id="${it.id}" data-code="${escapeHtml(d.code)}" data-idx="${d.idx}">${escapeHtml(d.code)}：${d.qty}${d.date?`（${escapeHtml(d.date)}）`:''}</div>`).join("")
      : `<span class="empty-inline">無庫存</span>`;
    return `<tr class="${rowExpired?'expire':''}">
      <td>${escapeHtml(it.brand)}</td>
      <td>${escapeHtml(it.model||"")}</td>
      <td>${escapeHtml(it.spec)}</td>
      <td>${totalQty(it)}</td>
      <td class="loc-detail-cell">${locHtml}</td>
      <td class="cost-cell" data-id="${it.id}">${it.cost!=null?it.cost:"未填"}</td>
      <td>${escapeHtml(it.remark||"")}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="7" class="empty">尚無資料</td></tr>`;

  body.querySelectorAll(".loc-line").forEach(el=>{
    el.addEventListener("click", ()=> openLocationModal(el.dataset.id, el.dataset.code, Number(el.dataset.idx)));
  });
  body.querySelectorAll(".cost-cell").forEach(td=>{
    td.addEventListener("click", ()=> editCost(td.dataset.id));
  });

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

function editCost(itemId){
  const item = itemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const cur = item.cost!=null ? String(item.cost) : "";
  const input = prompt("輸入成本金額（純數字）", cur);
  if(input === null) return; // 取消
  const val = input.trim();
  if(val === ""){
    db.collection("items").doc(itemId).update({ cost: null }).catch(e=>alert("更新失敗："+e.message));
    return;
  }
  const num = Number(val);
  if(isNaN(num)){ alert("請輸入數字"); return; }
  db.collection("items").doc(itemId).update({ cost: num }).catch(e=>alert("更新失敗："+e.message));
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
    儲位分布: locSummary(it), 成本: it.cost!=null?it.cost:"", 備註: it.remark||""
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
    儲位分布:locSummary(it), 成本:it.cost!=null?it.cost:"", 備註:it.remark||""
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
      // 銷貨：把「每個儲位×每一批不同生產日期」都列成狜立選項，選哪個就是從哪個儲位、哪一批扣庫存，
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
      // 沒填日期，且這個儲位是全新的或已經有多批：併入「未填日期」的那一批，沒有的話就新增一批未填日期
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
  // 舊資料（改版前的紀錄）沒有 batchDate 欄位，這種情況只能盡量抳第一批來調整
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
    await db.collection("items").add({brand, model, spec, remark, locations:{}, cost:null});
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
    <td>${escapeHtml(o.customerName||"")}</td>
    <td>${escapeHtml(o.customerContact||"")}</td>
    <td>${escapeHtml(o.customerNote||"")}</td>
    <td>
      <button data-confirm="${o.id}">確認</button>
      <button data-edit="${o.id}">修改</button>
      <button data-cancel="${o.id}">取消</button>
    </td>
  </tr>`).join("") || `<tr><td colspan="8" class="empty">目前沒有待確認訂單</td></tr>`;

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

  const html = `
    <div class="sheet-head"><h2>確認出貨：${escapeHtml(order.itemLabel||"")}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>客戶</label><input type="text" value="${escapeHtml(order.customerName||'')}（${escapeHtml(order.customerContact||'')}）" disabled></div>
    <div class="form-row"><label>數量</label><input type="text" value="${order.qty}" disabled></div>
    <div class="form-row"><label>選擇要出貨的儲位／批次</label>
      <select id="confirmLoc">${options.map((o,i)=>`<option value="${i}">${escapeHtml(o.code)}${o.date?`（${escapeHtml(o.date)}）`:''}（目前${o.qty}）</option>`).join("")}</select>
    </div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="confirmOrderSubmitBtn">確認出貨</button>
    </div>`;
  openModal(html);

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
    <div class="form-row"><label>數量</label><input type="number" id="editOrderQty" min="1" value="${order.qty}"></div>
    <div class="form-row"><label>客戶姓名</label><input type="text" id="editOrderCustomerName" value="${escapeHtml(order.customerName||'')}"></div>
    <div class="form-row"><label>聯絡方式</label><input type="text" id="editOrderCustomerContact" value="${escapeHtml(order.customerContact||'')}"></div>
    <div class="form-row"><label>備註</label><input type="text" id="editOrderCustomerNote" value="${escapeHtml(order.customerNote||'')}"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="editOrderSaveBtn">儲存</button>
    </div>`;
  openModal(html);

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
    try{
      await db.collection("orders").doc(orderId).update({
        itemId: selectedItemId, itemLabel, qty, customerName, customerContact, customerNote
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
  if(!newPw || newPw.length < 6){ alert("新密碼至少要16碼"); return; }
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
  // 否則走原本「舊資料整併結果」的匯入流程。
  if(wb.Sheets["品項主檔"] && wb.Sheets["儲位主檔"]){
    await restoreFullBackup(wb, statusEl);
    return;
  }

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
      const costVal = r["成本(已夂1.25)"];
      newItems.push({
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: locs, remark: r["備註"] || "",
        cost: (costVal === undefined || costVal === null || costVal === "") ? null : Number(costVal)
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
        locations: locs, remark: r["備註"] || "", cost: null
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
        cost: (r["成本"] === undefined || r["成本"] === null || r["成本"] === "") ? null : Number(r["成本"]),
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
// 共用 Modal
// ============================================================
// 手機上（尤其iOS Safari）打開鍵盤時，如果背景頁面還能滚動，畫面常常會整個跑掉、歪掉。
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
