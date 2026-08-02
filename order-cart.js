// ============================================================
// 叫貨購物車（第 7 批・第一階段）
// ------------------------------------------------------------
// 業務在客戶現場常常一次要叫好幾樣，舊流程是「一個品項開一次視窗、填一次客戶資料」，
// 三種輪胎就要把客戶姓名、聯絡方式填三遍，公司端也會收到三張看起來沒有關聯的叫貨單。
//
// 購物車的做法：
//   查到 A → 加入購物車、查到 B → 加入購物車 …… 最後「選一次客戶、按一次送出」。
//   送出時整車用「同一個 Firestore 交易」寫入，全部成功或全部失敗，
//   不會出現「三項只成功兩項、庫存卻已經預留了兩項」這種半成品狀態。
//
// 資料結構刻意維持不變：每個品項仍然是 orders / kybOrders 裡的一筆獨立叫貨單，
// 既有的庫存預留、倉管確認出貨、ERP 轉單邏輯完全不用改。
// 同一車的品項只是多帶四個欄位綁在一起：
//   cartId（系統用亂碼）、cartNo（人看的單號）、cartSeq（第幾項）、cartTotalItems（共幾項）
// 舊資料沒有這些欄位，會照常被當成單品項叫貨顯示。
//
// 注意：購物車只存在瀏覽器記憶體，重新整理或關掉分頁就會清空（尚未送出的東西不會進資料庫）。
// ============================================================

let orderCart = [];
let orderCartLineSeq = 0;

function orderCartTotalQty(){ return orderCart.reduce((sum,line)=>sum+(Number(line.qty)||0),0); }
function orderCartTotalAmount(){ return orderCart.reduce((sum,line)=>sum+(Number(line.totalAmount)||0),0); }
function orderCartSourceLabel(source){ return source === "kyb" ? "KYB" : "輪胎"; }

function addOrderCartLine(line){
  orderCartLineSeq += 1;
  orderCart.push({...line, lineId:"L" + orderCartLineSeq});
  renderOrderCartFab();
}
function removeOrderCartLine(lineId){
  orderCart = orderCart.filter(line=>line.lineId !== lineId);
  renderOrderCartFab();
  if(document.getElementById("orderCartSheet")){
    if(orderCart.length) openOrderCartSheet(); else closeModal();
  }
}
function clearOrderCart(){
  orderCart = [];
  renderOrderCartFab();
}

// ------------------------------------------------------------
// 浮動購物車按鈕：只在「商品與庫存」畫面且車上有東西時出現。
// ------------------------------------------------------------
function ensureOrderCartFab(){
  if(document.getElementById("orderCartFab")) return;
  const style = document.createElement("style");
  style.textContent = `
#orderCartFab{position:fixed;right:16px;bottom:18px;z-index:80;display:flex;align-items:center;gap:8px;
  padding:12px 18px;border:none;border-radius:999px;cursor:pointer;
  background:#1f6feb;color:#fff;font-size:15px;font-weight:700;
  box-shadow:0 6px 18px rgba(0,0,0,.28);}
#orderCartFab.hidden{display:none;}
#orderCartFab .cart-fab-badge{background:#fff;color:#1f6feb;border-radius:999px;
  min-width:22px;padding:1px 7px;font-size:13px;text-align:center;}
.cart-line{border:1px solid var(--border,#ddd);border-radius:10px;padding:10px 12px;margin-bottom:8px;}
.cart-line-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}
.cart-line-head strong{font-size:15px;}
.cart-line-sub{font-size:13px;color:var(--muted,#777);margin-top:3px;}
.cart-line-remove{border:none;background:transparent;color:#a31e22;font-size:13px;cursor:pointer;padding:2px 4px;}
.cart-source-tag{display:inline-block;font-size:11px;padding:1px 7px;border-radius:999px;
  background:#eef4ff;color:#2451a3;margin-right:6px;}
.cart-total-row{display:flex;justify-content:space-between;font-size:15px;font-weight:700;
  padding:10px 2px;border-top:1px solid var(--border,#ddd);margin-top:4px;}
@media print{#orderCartFab{display:none;}}`;
  document.head.appendChild(style);
  const fab = document.createElement("button");
  fab.id = "orderCartFab";
  fab.className = "hidden";
  fab.innerHTML = ICONS.cart + '<span>購物車</span><span class="cart-fab-badge" id="orderCartFabCount">0</span>';
  fab.addEventListener("click", openOrderCartSheet);
  document.body.appendChild(fab);
  // 切換到 ERP 或回到分類選擇畫面時，#app 會被加上 hidden，購物車按鈕要跟著收起來。
  const app = document.getElementById("app");
  if(app && window.MutationObserver){
    new MutationObserver(()=>renderOrderCartFab()).observe(app, {attributes:true, attributeFilter:["class"]});
  }
}
function renderOrderCartFab(){
  ensureOrderCartFab();
  const fab = document.getElementById("orderCartFab");
  const app = document.getElementById("app");
  const onInventory = app && !app.classList.contains("hidden");
  fab.classList.toggle("hidden", !(orderCart.length > 0 && onInventory));
  document.getElementById("orderCartFabCount").textContent = orderCart.length;
}

// ------------------------------------------------------------
// 購物車內容與結帳畫面
// ------------------------------------------------------------
function openOrderCartSheet(){
  if(!orderCart.length){ alert("購物車目前是空的。請先在庫存查詢頁把要叫的貨加進來。"); return; }
  const lines = orderCart.map(line=>`
    <div class="cart-line">
      <div class="cart-line-head">
        <div>
          <strong><span class="cart-source-tag">${orderCartSourceLabel(line.source)}</span>${escapeHtml(line.itemLabel)}</strong>
          <div class="cart-line-sub">儲位 ${escapeHtml(line.loc)}${line.batchDate?`（${escapeHtml(line.batchDate)}）`:""}　數量 ${line.qty}</div>
          <div class="cart-line-sub">單價 ${erpCartMoney(line.unitPrice)}　${escapeHtml(line.priceListLabel||"")}　含稅小計 NT$ ${erpCartMoney(line.totalAmount)}</div>
        </div>
        <button class="cart-line-remove" data-cart-remove="${line.lineId}">移除</button>
      </div>
    </div>`).join("");
  const html = `
    <div class="sheet-head"><h2>購物車（${orderCart.length} 項）</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div id="orderCartSheet">
      ${lines}
      <div class="cart-total-row"><span>合計 ${orderCartTotalQty()} 件</span><span>NT$ ${erpCartMoney(orderCartTotalAmount())}</span></div>
      <div class="note">整車會用同一筆交易送出：全部成功，或全部不送出。送出後庫存才會被預留。</div>
      <div class="form-row"><label>客戶姓名（可輸入關鍵字搜尋並點選帶入）</label><input type="text" id="cartCustomerName" autocomplete="off"><div class="autocomplete-list hidden" id="cartCustomerList"></div></div>
      <div class="form-row"><label>聯絡方式</label><input type="text" id="cartCustomerContact"></div>
      <div class="form-row"><label>備註（整車共用）</label><input type="text" id="cartCustomerNote"></div>
      <div class="form-actions">
        <button id="cartClearBtn">清空購物車</button>
        <button class="primary" id="cartSubmitBtn">送出並預留</button>
      </div>
    </div>`;
  openModal(html);
  bindOrderCustomerLookup("cartCustomerName","cartCustomerContact","cartCustomerList");
  document.querySelectorAll("[data-cart-remove]").forEach(btn=>{
    btn.addEventListener("click", ()=> removeOrderCartLine(btn.dataset.cartRemove));
  });
  document.getElementById("cartClearBtn").addEventListener("click", ()=>{
    if(!confirm("清空購物車？尚未送出的品項會全部移除。")) return;
    clearOrderCart();
    closeModal();
  });
  document.getElementById("cartSubmitBtn").addEventListener("click", submitOrderCartFromSheet);
}
function erpCartMoney(value){
  const n = Number(value) || 0;
  return n.toLocaleString("zh-TW", {maximumFractionDigits:0});
}

async function submitOrderCartFromSheet(){
  const input = document.getElementById("cartCustomerName");
  const customerName = input.value.trim();
  if(!customerName){ alert("請輸入或選擇客戶"); return; }
  const customer = {
    customerId: input.dataset.partyId || null,
    customerCode: input.dataset.partyCode || "",
    customerContactPerson: input.dataset.partyContact || "",
    customerName,
    customerContact: document.getElementById("cartCustomerContact").value.trim(),
    customerNote: document.getElementById("cartCustomerNote").value.trim()
  };
  const btn = document.getElementById("cartSubmitBtn");
  btn.disabled = true; btn.textContent = "送出中…";
  try{
    const result = await submitOrderCart(customer);
    clearOrderCart();
    closeModal();
    alert(`已送出 ${result.count} 項（單號 ${result.cartNo}），庫存已預留，等待倉管確認出貨。`);
  }catch(e){
    console.error(e);
    alert("送出失敗：" + (e.message || "請重新整理後再試一次") + "\n\n（整車都沒有送出，購物車內容仍保留）");
  }finally{
    btn.disabled = false; btn.textContent = "送出並預留";
  }
}

function orderCartNumber(){
  const d = new Date(), two = n => String(n).padStart(2,"0");
  return "CART-" + d.getFullYear() + two(d.getMonth()+1) + two(d.getDate()) + "-" +
    two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
}

// 整車送出：一個交易內先把所有品項與預留餘額讀完，驗證通過後才開始寫入。
// （Firestore 交易規定所有讀取都必須排在所有寫入之前。）
async function submitOrderCart(customer){
  const lines = orderCart.slice();
  if(!lines.length) throw new Error("購物車是空的");
  const cartNo = orderCartNumber();
  const cartId = db.collection("orders").doc().id;
  const now = new Date().toISOString();

  await db.runTransaction(async tx=>{
    // ---- 第一階段：讀取 ----
    const prepared = [];
    const balances = new Map();   // 同一個儲位／批次可能被車上多個品項用到，要合併計算
    for(const line of lines){
      const batchDate = line.source === "tire" ? (line.batchDate || null) : null;
      const itemRef = line.source === "tire"
        ? db.collection("items").doc(line.itemId)
        : db.collection("kybItems").doc(line.itemId);
      const balanceRef = reservationBalanceRef(line.source, line.itemId, line.loc, batchDate);
      const itemSnap = await tx.get(itemRef);
      const balanceSnap = await tx.get(balanceRef);
      if(!itemSnap.exists) throw new Error(`找不到「${line.itemLabel}」，可能已被刪除，請把它從購物車移除`);
      const actual = line.source === "tire"
        ? tireStockAt({id:line.itemId, ...itemSnap.data()}, line.loc, batchDate)
        : kybLocQty((itemSnap.data().locations || {})[line.loc]);
      const key = balanceRef.id;
      if(!balances.has(key)){
        balances.set(key, {
          ref:balanceRef, source:line.source, itemId:line.itemId, loc:line.loc, batchDate,
          actual, baseReserved:reservationBalanceQty(balanceSnap), added:0
        });
      }
      const bucket = balances.get(key);
      bucket.added += Number(line.qty) || 0;
      prepared.push({line, batchDate, balanceRef, balanceId:key});
    }
    // ---- 驗證：同一個儲位／批次的總需求不可超過可用量 ----
    for(const bucket of balances.values()){
      const available = Math.max(0, bucket.actual - bucket.baseReserved);
      if(bucket.added > available){
        throw new Error(`儲位 ${bucket.loc} 的可用庫存只剩 ${available}，但購物車裡合計要 ${bucket.added}，請調整數量後再送出`);
      }
    }
    // ---- 第二階段：寫入 ----
    prepared.forEach((entry, index)=>{
      const line = entry.line;
      const collectionName = line.source === "tire" ? "orders" : "kybOrders";
      const orderRef = db.collection(collectionName).doc();
      const reservationRef = db.collection("stockReservations").doc();
      const reservationKey = makeReservationKey(line.source, line.itemId, line.loc, entry.batchDate);
      const orderData = {
        itemId:line.itemId, itemLabel:line.itemLabel, qty:line.qty, loc:line.loc,
        priceListKey:line.priceListKey || "", priceListLabel:line.priceListLabel || "",
        unitPrice:line.unitPrice, taxMode:line.taxMode, lineAmount:line.lineAmount,
        subtotalAmount:line.subtotalAmount, taxAmount:line.taxAmount,
        totalAmount:line.totalAmount, taxRate:line.taxRate,
        ...customer,
        requestedByUid:currentUser.uid, requestedByName:currentUser.name,
        status:"pending", reservationId:reservationRef.id, reservationStatus:"active",
        requestedAt:now,
        cartId, cartNo, cartSeq:index + 1, cartTotalItems:prepared.length
      };
      if(line.source === "tire") orderData.batchDate = entry.batchDate;
      tx.set(orderRef, orderData);
      tx.set(reservationRef, {
        source:line.source, orderId:orderRef.id, itemId:line.itemId, loc:line.loc,
        batchDate:entry.batchDate, qty:line.qty, reservationKey, balanceId:entry.balanceId,
        status:"active", reservedByUid:currentUser.uid, reservedByName:currentUser.name,
        cartId, cartNo, createdAt:now
      });
    });
    for(const bucket of balances.values()){
      writeReservationBalance(tx, bucket.ref, bucket.source, bucket.itemId, bucket.loc, bucket.batchDate,
        bucket.baseReserved + bucket.added);
    }
  });

  return {cartNo, count:lines.length};
}
