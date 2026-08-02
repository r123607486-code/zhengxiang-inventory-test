// ============================================================
// KYB：進銷貨管理 / 訂單管理 / 我的訂單 / 儲位管理
// ============================================================
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

  // 新做的動作排越上方：優先用 createdAt(精確時間戳記)排序，沒有的舊資料用 date 當備援
  list.sort((a,b)=> (b.createdAt||b.date||"").localeCompare(a.createdAt||a.date||""));

  document.getElementById("kybTxnCount").textContent = `共 ${list.length} 筆`;
  body.innerHTML = list.map(t=>{
    const item = kybItemsCache.find(i=>i.id===t.itemId);
    const label = item ? item.carModel : "(車型已刪除)";
    return `<tr>
      <td>${escapeHtml(t.date)}</td>
      <td>${t.type==='in'?'進貨':t.type==='sales_return'?'銷貨退回入庫':t.type==='sales_return_void'?'銷貨退回作廢出庫':'銷貨'}</td>
      <td>${escapeHtml(label)}</td>
      <td>${t.qty}</td>
      <td>${escapeHtml(t.salesperson||"")}</td>
      <td>${escapeHtml(t.customerName||"")}</td>
      <td>${escapeHtml(t.operator||"")}</td>
      <td>${(t.type==="sales_return"||t.type==="sales_return_void")?'<span class="erp-form-hint">由 ERP 退回單管理</span>':'<button data-edit="${t.id}">編輯</button> <button data-del="${t.id}">刪除</button>'}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" class="empty">尚無紀錄</td></tr>`;

  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=>openEditKybTxnModal(b.dataset.edit)));
  body.querySelectorAll("[data-del]").forEach(b=>b.addEventListener("click", ()=>deleteKybTxn(b.dataset.del)));
}

function openKybTxnModal(){
  const html = `
    <div class="sheet-head"><h2>新增進貨／銷貨</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>類型</label>
      <select id="kybTxnType"><option value="in">進貨</option><option value="out">銷貨</option></select>
    </div>
    <div class="form-row">
      <label>搜尋車型（找不到請確認避震款式，例如CRV可能同時有白桶／藍桶）</label>
      <input type="text" id="kybTxnItemSearch" placeholder="例如 Altis">
      <div class="autocomplete-list hidden" id="kybTxnItemList"></div>
    </div>
    <div class="form-row"><label>已選車型</label><input type="text" id="kybTxnItemLabel" disabled></div>
    <div class="form-row"><label>數量</label><input type="number" id="kybTxnQty" min="1"></div>
    <div class="form-row"><label>儲位</label>
      <select id="kybTxnLoc"><option value="">請先選擇車型</option></select>
    </div>
    <div class="form-row" id="kybTxnCostRow"><label>進價（選填，每單位成本，只有進貨才需要；用於未來計算毛利，目前不會顯示在任何報表）</label><input type="number" id="kybTxnCost" min="0" step="0.01" placeholder="例如 1500"></div>
    <div id="kybTxnSaleRows" class="hidden">
      <div class="form-row"><label>客戶姓名（銷貨必填，可輸入關鍵字搜尋並點選帶入）</label><input type="text" id="kybTxnCustomerName" autocomplete="off"><div class="autocomplete-list hidden" id="kybTxnCustomerList"></div></div>
      <div class="form-row"><label>聯絡方式</label><input type="text" id="kybTxnCustomerContact"></div>
      <section class="sales-pricing-box" id="kybTxnPriceBox" data-sales-source="kyb"><div class="sales-pricing-title">銷售金額與稅別</div><div class="form-row"><label>套用價目表</label><select id="kybTxnPricePriceList"><option value="">請先選擇品項</option></select></div><div class="form-row"><label>單價</label><input type="number" min="0" step="1" inputmode="numeric" id="kybTxnPriceUnitPrice" placeholder="請輸入實際成交單價"></div><div class="form-row"><label>稅別</label><select id="kybTxnPriceTaxMode"><option value="no_tax">不計稅</option><option value="tax_included">稅內含（5%）</option><option value="tax_excluded">稅外加（5%）</option></select></div><div class="sales-pricing-summary" id="kybTxnPriceSummary"></div></section>
    </div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="kybTxnSubmitBtn">確認送出</button>
    </div>`;
  openModal(html);
  let selectedItemId = null;
  bindOrderCustomerLookup("kybTxnCustomerName","kybTxnCustomerContact","kybTxnCustomerList");
  const txnPricing=bindSalesPricing("kybTxnPrice","kyb",()=>kybItemsCache.find(i=>i.id===selectedItemId),()=>Number(document.getElementById("kybTxnQty").value)||0,null,"kybTxnQty");

  function refreshLocOptions(){
    const type = document.getElementById("kybTxnType").value;
    const locSelect = document.getElementById("kybTxnLoc");
    const it = kybItemsCache.find(i=>i.id===selectedItemId);
    const costRow = document.getElementById("kybTxnCostRow");
    if(type === "out"){
      costRow.classList.add("hidden");
      document.getElementById("kybTxnCost").value = "";
    } else {
      costRow.classList.remove("hidden");
    }
    const saleRows=document.getElementById("kybTxnSaleRows");
    if(type === "out") saleRows.classList.remove("hidden"); else saleRows.classList.add("hidden");
    if(!it){ locSelect.innerHTML = `<option value="">請先選擇車型</option>`; txnPricing.setItem(null); return; }
    if(type === "out"){ txnPricing.setItem(it);

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
    listEl.innerHTML = matches.map(it=>`<div data-id="${it.id}">${escapeHtml(kybItemLabel(it))}</div>`).join("");
    listEl.classList.toggle("hidden", matches.length===0);
    listEl.querySelectorAll("div").forEach(d=>d.addEventListener("click", ()=>{
      selectedItemId = d.dataset.id;
      const it = kybItemsCache.find(i=>i.id===selectedItemId);
      document.getElementById("kybTxnItemLabel").value = kybItemLabel(it);
      listEl.classList.add("hidden");
      searchInput.value = "";
      refreshLocOptions();
    }));
  });

  document.getElementById("kybTxnSubmitBtn").addEventListener("click", async ()=>{
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
    const costInput = document.getElementById("kybTxnCost").value;
    const unitCost = (type === "in" && costInput !== "") ? Number(costInput) : null;
    let saleData={};
    if(type === "out"){
      const customerInput=document.getElementById("kybTxnCustomerName");
      const customerName=customerInput.value.trim();
      if(!customerName){alert("銷貨請輸入客戶姓名");return;}
      try{saleData={customerId:customerInput.dataset.partyId||null,customerCode:customerInput.dataset.partyCode||"",customerContactPerson:customerInput.dataset.partyContact||"",customerName,customerContact:document.getElementById("kybTxnCustomerContact").value.trim(),salesperson:currentUser.name,...readSalesPricing("kybTxnPrice",qty)};}catch(e){alert(e.message);return;}
    }
    try{
      await submitKybTxn(selectedItemId, type, qty, loc, unitCost, saleData);
    }catch(e){
      console.error("KYB 進銷貨送出失敗：", e);
      alert("送出失敗：" + (e.message || "資料庫拒絕寫入。請聯絡管理者確認 Firebase 權限。"));
    }
  });
}

async function submitKybTxn(itemId, type, qty, loc, unitCost){
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
    itemId, type, qty, loc, date: todayStr(), operator: currentUser.name, editLog: [],
    unitCost: (type === "in" && unitCost != null && Number.isFinite(unitCost)) ? unitCost : null,
    createdAt: new Date().toISOString()
  });
  await refreshKybViews();
  closeModal();
}

// 編輯進銷貨紀錄：日期、數量、儲位、業務、客戶姓名都可以改。
// 儲位一定要從現有儲位清單選（不能自己打字）。
// 不管改哪個欄位，都會先把「舊紀錄」對庫存的影響完全還原，再套用「新紀錄」的影響，確保庫存數量一定會跟著正確增減。
function openEditKybTxnModal(txnId){
  const t = kybTxnCache.find(x=>x.id===txnId);
  if(!t) return;
  const item = kybItemsCache.find(i=>i.id===t.itemId);
  const itemLabel = item ? kybItemLabel(item) : "(車型已刪除，仍可編輯其他資訊，但無法改儲位)";
  const html = `
    <div class="sheet-head"><h2>編輯進銷貨紀錄</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>車型</label><input type="text" value="${escapeHtml(itemLabel)}" disabled></div>
    <div class="form-row"><label>類型</label><input type="text" value="${t.type==='in'?'進貨':'銷貨'}" disabled></div>
    <div class="form-row"><label>日期</label><input type="date" id="editKybTxnDate" value="${escapeHtml(t.date||todayStr())}"></div>
    <div class="form-row"><label>數量</label><input type="number" id="editKybTxnQty" min="1" value="${t.qty}"></div>
    <div class="form-row"><label>儲位</label>
      <select id="editKybTxnLoc">${kybLocationsCache.map(l=>`<option value="${escapeHtml(l.code)}" ${l.code===t.loc?'selected':''}>${escapeHtml(l.code)}</option>`).join("")}</select>
    </div>
    <div class="form-row"><label>業務</label><input type="text" id="editKybTxnSalesperson" value="${escapeHtml(t.salesperson||"")}"></div>
    <div class="form-row"><label>客戶姓名</label><input type="text" id="editKybTxnCustomerName" value="${escapeHtml(t.customerName||"")}"></div>
    <div id="kybEditTxnPriceWrap" class="${t.type==='out'?'':'hidden'}">${salesPricingHtml("kybEditTxnPrice","kyb")}</div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="editKybTxnSaveBtn">儲存</button>
    </div>`;
  openModal(html);
  const editPricing=t.type==="out"?bindSalesPricing("kybEditTxnPrice","kyb",()=>item,()=>Number(document.getElementById("editKybTxnQty").value)||0,t,"editKybTxnQty"):null;

  document.getElementById("editKybTxnSaveBtn").addEventListener("click", async ()=>{
    const newDate = document.getElementById("editKybTxnDate").value || todayStr();
    const newQty = Number(document.getElementById("editKybTxnQty").value);
    const newLoc = document.getElementById("editKybTxnLoc").value;
    const newSalesperson = document.getElementById("editKybTxnSalesperson").value.trim();
    const newCustomerName = document.getElementById("editKybTxnCustomerName").value.trim();
    if(!newQty || newQty<=0){ alert("請輸入正確的數量"); return; }
    if(!newLoc){ alert("請選擇儲位"); return; }
    let saleData={};
    if(t.type==="out"){try{saleData=readSalesPricing("kybEditTxnPrice",newQty);}catch(e){alert(e.message);return;}}
    try{
      await saveEditKybTxn(t, { date:newDate, qty:newQty, loc:newLoc, salesperson:newSalesperson, customerName:newCustomerName, ...saleData });
      closeModal();
    }catch(e){
      alert("儲存失敗："+e.message);
    }
  });
}

async function saveEditKybTxn(t, next){
  if(stockReservationsCache.some(r=>r.status==="active" && r.source==="kyb" && r.itemId===t.itemId)) throw new Error("此車型目前有有效預留；請先由管理者釋放預留，再修改舊進銷貨紀錄。");
  const itemRef = db.collection("kybItems").doc(t.itemId);
  const itemSnap = await itemRef.get();
  if(itemSnap.exists){
    const item = itemSnap.data();
    const allLocs = {...(item.locations||{})};

    // 1) 先把「舊紀錄」對庫存的影響完全還原（進貨要扣掉、銷貨要加回去）
    const oldSign = t.type === "in" ? -1 : 1;
    const revertedOldQty = kybLocQty(allLocs[t.loc]) + t.qty*oldSign;
    if(revertedOldQty <= 0) delete allLocs[t.loc]; else allLocs[t.loc] = revertedOldQty;

    // 2) 在還原後的庫存基礎上，套用「新紀錄」的內容
    const newSign = t.type === "in" ? 1 : -1;
    const curAtNewLoc = kybLocQty(allLocs[next.loc]);
    const resultQty = curAtNewLoc + next.qty*newSign;
    if(t.type === "out" && resultQty < 0){
      throw new Error(`這個儲位目前只有 ${curAtNewLoc}，不夠改成銷貨 ${next.qty}`);
    }
    if(resultQty <= 0) delete allLocs[next.loc]; else allLocs[next.loc] = resultQty;

    await itemRef.update({ locations: allLocs });
  }

  await db.collection("kybTransactions").doc(t.id).update({
    date: next.date, qty: next.qty, loc: next.loc,
    salesperson: next.salesperson, customerName: next.customerName,
    ...(t.type==="out"?salesPricingStoredFields(next,next.qty):{}),
    editLog: firebase.firestore.FieldValue.arrayUnion({
      before: { date:t.date||null, qty:t.qty, loc:t.loc, salesperson:t.salesperson||"", customerName:t.customerName||"", unitPrice:Number(t.unitPrice)||0, taxMode:t.taxMode||"no_tax" },
      after: { date:next.date, qty:next.qty, loc:next.loc, salesperson:next.salesperson, customerName:next.customerName, unitPrice:Number(next.unitPrice)||0, taxMode:next.taxMode||"no_tax" },
      time: new Date().toISOString(), by: currentUser.name
    })
  });
  await refreshKybViews();
}

async function deleteKybTxn(txnId){
  const t = kybTxnCache.find(x=>x.id===txnId);
  if(!t) return;
  if(stockReservationsCache.some(r=>r.status==="active" && r.source==="kyb" && r.itemId===t.itemId)){ alert("此車型目前有有效預留；請先由管理者釋放預留，再刪除舊進銷貨紀錄。"); return; }
  if(!confirm("確定要刪除這筆紀錄嗎？（會自動把庫存改回去）")) return;
  const itemRef = db.collection("kybItems").doc(t.itemId);
  const itemSnap = await itemRef.get();
  if(itemSnap.exists){
    const item = itemSnap.data();
    const allLocs = {...(item.locations||{})};
    const sign = t.type === "in" ? -1 : 1;
    const next = kybLocQty(allLocs[t.loc]) + t.qty*sign;
    if(next <= 0) delete allLocs[t.loc]; else allLocs[t.loc] = next;
    await itemRef.update({locations: allLocs});
  }
  await db.collection("kybTransactions").doc(txnId).delete();
  await refreshKybViews();
}

function openNewKybItemModal(){
  const bucketOptions = ["白桶","藍桶","深藍桶"];
  const html = `
    <div class="sheet-head"><h2>新增車型</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>車型</label><input type="text" id="newKybModel" placeholder="例如 Altis '19~"></div>
    <div class="form-row"><label>廠牌</label><input type="text" id="newKybMake" placeholder="例如 TOYOTA"></div>
    <div class="form-row"><label>避震款式</label>
      <select id="newKybBucket">${bucketOptions.map(b=>`<option value="${b}">${b}</option>`).join("")}</select>
    </div>
    <div class="form-row"><label>年份代碼（選填）</label><input type="text" id="newKybYearCode" placeholder="例如 193-"></div>
    <div class="form-row"><label>料號（選填）</label><input type="text" id="newKybPartNo" placeholder="例如 NSTC5666L/NSTC5666R/NSFC2222"></div>
    <div class="form-row"><label>一線消費者售價</label><input type="number" id="newKybCatalogPrice"></div>
    <div class="form-row"><label>保修廠價</label><input type="number" id="newKybWarrantyPrice"></div>
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
      carModel, brand:"KYB",
      carMake: document.getElementById("newKybMake").value.trim(),
      bucketType: document.getElementById("newKybBucket").value,
      yearCode: document.getElementById("newKybYearCode").value.trim(),
      partNo: document.getElementById("newKybPartNo").value.trim(),
      remark: document.getElementById("newKybRemark").value.trim(),
      locations:{}, catalogPrice: toNum("newKybCatalogPrice"), warrantyPrice: toNum("newKybWarrantyPrice")
    });
    closeModal();
  });
}

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
    orderId: order.id, editLog: [],
    createdAt: new Date().toISOString()
  });
}

function openEditKybOrderModal(orderId){
  const order = kybOrdersCache.find(o=>o.id===orderId);
  if(!order) return;
  let selectedItemId = order.itemId;
  const html = `
    <div class="sheet-head"><h2>修改訂單</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row">
      <label>搜尋車型（要換車型才需要，不換不用理它；找不到請確認避震款式，例如CRV可能同時有白桶／藍桶）</label>
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
    listEl.innerHTML = matches.map(it=>`<div data-id="${it.id}">${escapeHtml(kybItemLabel(it))}</div>`).join("");
    listEl.classList.toggle("hidden", matches.length===0);
    listEl.querySelectorAll("div").forEach(d=>d.addEventListener("click", ()=>{
      selectedItemId = d.dataset.id;
      const it = kybItemsCache.find(i=>i.id===selectedItemId);
      document.getElementById("editKybOrderItemLabel").value = kybItemLabel(it);
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


// ===== 第 5 批：KYB 預留釋放、取消與確認出貨 =====
function renderKybOrders(){
  const body=document.getElementById("kybOrdersBody");if(!body)return;document.getElementById("kybOrdersCount").textContent=`共 ${kybOrdersCache.length} 筆待確認`;
  const sorted=kybOrdersCache.slice().sort((a,b)=>(a.requestedAt||"").localeCompare(b.requestedAt||""));
  body.innerHTML=sorted.map(o=>`<tr><td>${escapeHtml((o.requestedAt||"").slice(0,16).replace("T"," "))}</td><td>${escapeHtml(o.requestedByName||"")}</td><td>${escapeHtml(o.itemLabel||"")}</td><td>${o.qty}</td><td>${o.loc?`${escapeHtml(o.loc)}<br><small>${escapeHtml(reservationStateLabel(o))}</small>`:'<span class="empty-inline">未選</span>'}</td><td>${escapeHtml(o.customerName||"")}</td><td>${escapeHtml(o.customerContact||"")}</td><td>${escapeHtml(o.customerNote||"")}</td><td><button data-confirm="${o.id}">確認</button><button data-edit="${o.id}">修改</button>${userHasAnyRole("admin")&&o.reservationStatus==="active"?`<button data-release="${o.id}">釋放預留</button>`:''}<button data-cancel="${o.id}">取消</button></td></tr>`).join("")||`<tr><td colspan="9" class="empty">目前沒有待確認訂單</td></tr>`;
  body.querySelectorAll("[data-confirm]").forEach(b=>b.addEventListener("click",()=>openConfirmKybOrderModal(b.dataset.confirm)));body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click",()=>openEditKybOrderModal(b.dataset.edit)));body.querySelectorAll("[data-release]").forEach(b=>b.addEventListener("click",()=>releaseKybReservation(b.dataset.release,"管理者手動釋放")));body.querySelectorAll("[data-cancel]").forEach(b=>b.addEventListener("click",()=>cancelKybOrder(b.dataset.cancel)));
}
function renderKybMyOrders(){
  const body=document.getElementById("kybMyOrdersBody");if(!body)return;const sorted=kybMyOrdersCache.slice().sort((a,b)=>(b.requestedAt||"").localeCompare(a.requestedAt||""));document.getElementById("kybMyOrdersCount").textContent=`共 ${sorted.length} 筆`;
  const statusLabel={pending:"待確認",confirmed:"已出貨",cancelled:"已取消"};body.innerHTML=sorted.map(o=>`<tr><td>${escapeHtml((o.requestedAt||"").slice(0,16).replace("T"," "))}</td><td>${escapeHtml(o.itemLabel||"")}</td><td>${o.qty}</td><td>${escapeHtml(o.customerName||"")}</td><td>${statusLabel[o.status]||o.status}<br><small>${escapeHtml(reservationStateLabel(o))}</small></td><td>${o.status==="pending"?`<button data-cancel-own="${o.id}">取消叫貨</button>`:''}</td></tr>`).join("")||`<tr><td colspan="6" class="empty">尚無訂單紀錄</td></tr>`;body.querySelectorAll("[data-cancel-own]").forEach(b=>b.addEventListener("click",()=>cancelKybOrder(b.dataset.cancelOwn)));
}
async function releaseKybReservation(orderId,reason){
  if(!confirm("確定要釋放這筆訂單的庫存預留嗎？訂單會保留為待確認，但數量將重新開放給其他叫貨。"))return;
  try{await db.runTransaction(async tx=>{const orderRef=db.collection("kybOrders").doc(orderId),orderSnap=await tx.get(orderRef);if(!orderSnap.exists)throw new Error("找不到訂單");const order=orderSnap.data();if(!order.reservationId)throw new Error("這是舊訂單，沒有可釋放的預留");const resRef=db.collection("stockReservations").doc(order.reservationId),resSnap=await tx.get(resRef);if(!resSnap.exists||resSnap.data().status!=="active")throw new Error("這筆預留已經不是啟用狀態");const now=new Date().toISOString();tx.update(resRef,{status:"released",releasedAt:now,releasedBy:currentUser.name,releaseReason:reason});tx.update(orderRef,{reservationStatus:"released",reservationReleasedAt:now,reservationReleasedBy:currentUser.name});});}catch(e){alert("釋放失敗："+e.message);}
}
async function cancelKybOrder(orderId){
  if(!confirm("確定要取消這筆訂單嗎？若仍有預留量，會同時釋放。"))return;
  try{await db.runTransaction(async tx=>{const orderRef=db.collection("kybOrders").doc(orderId),orderSnap=await tx.get(orderRef);if(!orderSnap.exists)throw new Error("找不到訂單");const order=orderSnap.data();if(order.status!=="pending")throw new Error("只有待確認訂單可以取消");let resRef=null,resSnap=null;if(order.reservationId){resRef=db.collection("stockReservations").doc(order.reservationId);resSnap=await tx.get(resRef);}const now=new Date().toISOString();if(resSnap&&resSnap.exists&&resSnap.data().status==="active")tx.update(resRef,{status:"released",releasedAt:now,releasedBy:currentUser.name,releaseReason:"訂單取消"});tx.update(orderRef,{status:"cancelled",cancelledAt:now,cancelledBy:currentUser.name,reservationStatus:resSnap&&resSnap.exists&&resSnap.data().status==="active"?"released":order.reservationStatus||null});});}catch(e){alert("取消失敗："+e.message);}
}
async function confirmKybOrder(order,loc){
  return db.runTransaction(async tx=>{const orderRef=db.collection("kybOrders").doc(order.id),itemRef=db.collection("kybItems").doc(order.itemId),orderSnap=await tx.get(orderRef),itemSnap=await tx.get(itemRef);if(!orderSnap.exists||!itemSnap.exists)throw new Error("訂單或車型已不存在");const liveOrder=orderSnap.data();if(liveOrder.status!=="pending")throw new Error("這筆訂單已不是待確認狀態");let oldResRef=null,oldResSnap=null;if(liveOrder.reservationId){oldResRef=db.collection("stockReservations").doc(liveOrder.reservationId);oldResSnap=await tx.get(oldResRef);}const key=makeReservationKey("kyb",liveOrder.itemId,loc,null),keyedReservations=await tx.get(db.collection("stockReservations").where("reservationKey","==",key));const otherReserved=keyedReservations.docs.reduce((sum,d)=>{const r=d.data();return sum+(r.status==="active"&&d.id!==liveOrder.reservationId?(Number(r.qty)||0):0);},0);const item={id:liveOrder.itemId,...itemSnap.data()},physical=kybLocQty((item.locations||{})[loc]);if(liveOrder.qty>physical-otherReserved)throw new Error(`這個儲位可用庫存只剩 ${Math.max(0,physical-otherReserved)}，請改選其他儲位`);const allLocs={...(item.locations||{})},next=physical-liveOrder.qty;if(next>0)allLocs[loc]=next;else delete allLocs[loc];const now=new Date().toISOString(),txnRef=db.collection("kybTransactions").doc();tx.update(itemRef,{locations:allLocs});tx.set(txnRef,{itemId:liveOrder.itemId,type:"out",qty:liveOrder.qty,loc,date:todayStr(),operator:currentUser.name,salesperson:liveOrder.requestedByName||"",customerName:liveOrder.customerName||"",customerContact:liveOrder.customerContact||"",customerNote:liveOrder.customerNote||"",orderId:order.id,reservationId:liveOrder.reservationId||null,editLog:[],createdAt:now});if(oldResSnap&&oldResSnap.exists&&oldResSnap.data().status==="active")tx.update(oldResRef,{status:"consumed",consumedAt:now,consumedBy:currentUser.name,fulfilledLoc:loc});tx.update(orderRef,{status:"confirmed",confirmedAt:now,confirmedBy:currentUser.name,linkedTxnId:txnRef.id,reservationStatus:oldResSnap&&oldResSnap.exists&&oldResSnap.data().status==="active"?"consumed":liveOrder.reservationStatus||null});return txnRef;});
}
function openConfirmKybOrderModal(orderId){
  const order=kybOrdersCache.find(o=>o.id===orderId);if(!order)return;const item=kybItemsCache.find(i=>i.id===order.itemId);if(!item){alert("找不到車型");return;}const options=kybLocList(item).map(o=>({...o,available:kybAvailableAt(item,o.code,order.reservationId)})).filter(o=>o.available>0);if(!options.length){alert("目前沒有可出貨的可用庫存；可先由管理者釋放其他預留或取消訂單。");return;}let defaultIdx=options.findIndex(o=>o.code===order.loc);if(defaultIdx<0)defaultIdx=0;const html=`<div class="sheet-head"><h2>確認出貨：${escapeHtml(order.itemLabel||"")}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div><div class="form-row"><label>客戶</label><input type="text" value="${escapeHtml(order.customerName||"")}（${escapeHtml(order.customerContact||"")}）" disabled></div><div class="form-row"><label>數量</label><input type="text" value="${order.qty}" disabled></div><div class="form-row"><label>出貨儲位</label><select id="kybConfirmLoc">${options.map((o,i)=>`<option value="${i}" ${i===defaultIdx?"selected":""}>${escapeHtml(o.code)}（庫存 ${o.qty}／可用 ${o.available}）</option>`).join("")}</select></div><div class="count" id="kybConfirmStockWarn" style="color:#a31e22;"></div><div class="form-actions"><button onclick="closeModal()">取消</button><button class="primary" id="kybConfirmOrderSubmitBtn">確認出貨</button></div>`;openModal(html);const refresh=()=>{const o=options[Number(document.getElementById("kybConfirmLoc").value)];document.getElementById("kybConfirmStockWarn").textContent=o&&order.qty>o.available?`⚠ 可用量只有 ${o.available}，不足出貨 ${order.qty}`:"";};document.getElementById("kybConfirmLoc").addEventListener("change",refresh);refresh();document.getElementById("kybConfirmOrderSubmitBtn").addEventListener("click",async()=>{const opt=options[Number(document.getElementById("kybConfirmLoc").value)];if(!opt||order.qty>opt.available){alert("可用庫存不足，請重新選擇");return;}try{await confirmKybOrder(order,opt.code);closeModal();}catch(e){alert("確認失敗："+e.message);}});
}


// ===== 第 5 批：倉管修改 KYB 訂單時，同步重算預留 =====
async function saveKybOrderEdit(order,change){
  await db.runTransaction(async tx=>{
    const orderRef=db.collection("kybOrders").doc(order.id),itemRef=db.collection("kybItems").doc(change.itemId);
    const orderSnap=await tx.get(orderRef),itemSnap=await tx.get(itemRef);if(!orderSnap.exists||!itemSnap.exists)throw new Error("訂單或車型已不存在");
    const live=orderSnap.data();if(live.status!=="pending")throw new Error("只有待確認訂單可以修改");
    let oldRef=null,oldSnap=null;if(live.reservationId){oldRef=db.collection("stockReservations").doc(live.reservationId);oldSnap=await tx.get(oldRef);}
    const key=makeReservationKey("kyb",change.itemId,change.loc,null),matched=await tx.get(db.collection("stockReservations").where("reservationKey","==",key));
    const others=matched.docs.reduce((sum,d)=>{const r=d.data();return sum+(r.status==="active"&&d.id!==live.reservationId?(Number(r.qty)||0):0);},0);
    const actual=kybLocQty((itemSnap.data().locations||{})[change.loc]);if(change.qty>actual-others)throw new Error(`新選擇的可用庫存只有 ${Math.max(0,actual-others)}，無法預留 ${change.qty}`);
    const now=new Date().toISOString(),sameKey=oldSnap&&oldSnap.exists&&oldSnap.data().reservationKey===key&&oldSnap.data().status==="active";let reservationRef=oldRef;
    if(sameKey)tx.update(oldRef,{qty:change.qty,updatedAt:now,updatedBy:currentUser.name});else{if(oldSnap&&oldSnap.exists&&oldSnap.data().status==="active")tx.update(oldRef,{status:"released",releasedAt:now,releasedBy:currentUser.name,releaseReason:"倉管修改訂單"});reservationRef=db.collection("stockReservations").doc();tx.set(reservationRef,{source:"kyb",orderId:order.id,itemId:change.itemId,loc:change.loc,batchDate:null,qty:change.qty,reservationKey:key,status:"active",reservedByUid:live.requestedByUid||"",reservedByName:live.requestedByName||"",createdAt:now,createdBy:currentUser.name});}
    tx.update(orderRef,{...change,reservationId:reservationRef.id,reservationStatus:"active",updatedAt:now,updatedBy:currentUser.name});
  });
}
function openEditKybOrderModal(orderId){
  const order=kybOrdersCache.find(o=>o.id===orderId);if(!order)return;let selectedItemId=order.itemId,locOptions=[];
  const html=`<div class="sheet-head"><h2>修改訂單與預留</h2><button class="sheet-close" onclick="closeModal()">✕</button></div><div class="form-row"><label>搜尋車型（需要換車型才輸入）</label><input type="text" id="editKybOrderItemSearch" placeholder="例如 Altis"><div class="autocomplete-list hidden" id="editKybOrderItemList"></div></div><div class="form-row"><label>目前車型</label><input type="text" id="editKybOrderItemLabel" value="${escapeHtml(order.itemLabel||'')}" disabled></div><div class="form-row"><label>預留儲位</label><select id="editKybOrderLoc"></select></div><div class="form-row"><label>數量</label><input type="number" id="editKybOrderQty" min="1" value="${order.qty}"></div><div class="form-row"><label>客戶姓名</label><input type="text" id="editKybOrderCustomerName" value="${escapeHtml(order.customerName||'')}"></div><div class="form-row"><label>聯絡方式</label><input type="text" id="editKybOrderCustomerContact" value="${escapeHtml(order.customerContact||'')}"></div><div class="form-row"><label>備註</label><input type="text" id="editKybOrderCustomerNote" value="${escapeHtml(order.customerNote||'')}"></div><section class="sales-pricing-box" id="kybEditOrderPriceBox" data-sales-source="kyb"><div class="sales-pricing-title">銷售金額與稅別</div><div class="form-row"><label>套用價目表</label><select id="kybEditOrderPricePriceList"><option value="">請先選擇品項</option></select></div><div class="form-row"><label>單價</label><input type="number" min="0" step="1" inputmode="numeric" id="kybEditOrderPriceUnitPrice" placeholder="請輸入實際成交單價"></div><div class="form-row"><label>稅別</label><select id="kybEditOrderPriceTaxMode"><option value="no_tax">不計稅</option><option value="tax_included">稅內含（5%）</option><option value="tax_excluded">稅外加（5%）</option></select></div><div class="sales-pricing-summary" id="kybEditOrderPriceSummary"></div></section><div class="form-actions"><button onclick="closeModal()">取消</button><button class="primary" id="editKybOrderSaveBtn">儲存並重新預留</button></div>`;
  openModal(html);
  const editPricing=bindSalesPricing("kybEditOrderPrice","kyb",()=>kybItemsCache.find(i=>i.id===selectedItemId),()=>Number(document.getElementById("editKybOrderQty").value)||0,order,"editKybOrderQty");
  const renderLocs=()=>{const item=kybItemsCache.find(i=>i.id===selectedItemId);locOptions=item?kybLocList(item).map(o=>({...o,available:kybAvailableAt(item,o.code,order.reservationId)})).filter(o=>o.available>0):[];const select=document.getElementById("editKybOrderLoc");if(!locOptions.length){select.innerHTML='<option value="">目前沒有可用庫存</option>';return;}let selected=locOptions.findIndex(o=>o.code===order.loc);if(selected<0)selected=0;select.innerHTML=locOptions.map((o,i)=>`<option value="${i}" ${i===selected?"selected":""}>${escapeHtml(o.code)}（庫存 ${o.qty}／可用 ${o.available}）</option>`).join("");};
  renderLocs();
  const search=document.getElementById("editKybOrderItemSearch");search.addEventListener("input",()=>{const q=norm(search.value),list=document.getElementById("editKybOrderItemList");if(!q){list.classList.add("hidden");return;}const matches=kybItemsCache.filter(it=>norm(it.carModel).includes(q)).slice(0,15);list.innerHTML=matches.map(it=>`<div data-id="${it.id}">${escapeHtml(kybItemLabel(it))}</div>`).join("");list.classList.toggle("hidden",matches.length===0);list.querySelectorAll("div").forEach(d=>d.addEventListener("click",()=>{selectedItemId=d.dataset.id;const it=kybItemsCache.find(x=>x.id===selectedItemId);document.getElementById("editKybOrderItemLabel").value=kybItemLabel(it);list.classList.add("hidden");search.value="";renderLocs();editPricing.setItem(it);}));});
  document.getElementById("editKybOrderSaveBtn").addEventListener("click",async()=>{const qty=Number(document.getElementById("editKybOrderQty").value),opt=locOptions[Number(document.getElementById("editKybOrderLoc").value)],item=kybItemsCache.find(i=>i.id===selectedItemId);const customerName=document.getElementById("editKybOrderCustomerName").value.trim(),customerContact=document.getElementById("editKybOrderCustomerContact").value.trim(),customerNote=document.getElementById("editKybOrderCustomerNote").value.trim();if(!item||!opt||!qty||qty<=0){alert("請選擇有可用量的車型、儲位與數量");return;}if(!customerName){alert("請輸入客戶姓名");return;}let pricing;try{pricing=readSalesPricing("kybEditOrderPrice",qty);}catch(e){alert(e.message);return;}try{await saveKybOrderEdit(order,{itemId:item.id,itemLabel:`${item.carModel}（KYB）`,qty,loc:opt.code,customerName,customerContact,customerNote,...pricing});closeModal();}catch(e){alert("儲存失敗："+e.message);}});
}


// 第 5 批：KYB 庫存異動出貨不得吃掉已預留數量
async function submitKybTxn(itemId,type,qty,loc,unitCost){
  const itemRef=db.collection("kybItems").doc(itemId);
  await db.runTransaction(async tx=>{
    const itemSnap=await tx.get(itemRef);if(!itemSnap.exists)throw new Error("找不到車型");
    const item=itemSnap.data(),allLocs={...(item.locations||{})},current=kybLocQty(allLocs[loc]);
    if(type==="out"){
      const resSnap=await tx.get(db.collection("stockReservations").where("reservationKey","==",makeReservationKey("kyb",itemId,loc,null)));
      const reserved=resSnap.docs.reduce((s,d)=>{const r=d.data();return s+(r.status==="active"?(Number(r.qty)||0):0);},0),available=current-reserved;
      if(qty>available)throw new Error(`可用庫存只有 ${Math.max(0,available)}，不能扣除已預留數量`);
    }
    const next=type==="in"?current+qty:current-qty;if(next<0)throw new Error("庫存不足，無法出貨");if(next>0)allLocs[loc]=next;else delete allLocs[loc];
    const now=new Date().toISOString(),txnRef=db.collection("kybTransactions").doc();
    tx.update(itemRef,{locations:allLocs});tx.set(txnRef,{itemId,type,qty,loc,date:todayStr(),operator:currentUser.name,editLog:[],unitCost:(type==="in"&&unitCost!=null&&Number.isFinite(unitCost))?unitCost:null,createdAt:now});
  });
  await refreshKybViews();closeModal();
}


// ===== 第 5 批修正：KYB 預留餘額交易（不在交易中查詢）=====
function kybReservationBalanceRef(res){
  return db.collection("stockReservationBalances").doc(res.balanceId||reservationBalanceId("kyb",res.itemId,res.loc,null));
}
async function releaseKybReservation(orderId,reason){
  if(!confirm("確定要釋放這筆訂單的庫存預留嗎？訂單會保留為待確認，但數量將重新開放給其他叫貨。"))return;
  try{await db.runTransaction(async tx=>{
    const orderRef=db.collection("kybOrders").doc(orderId),orderSnap=await tx.get(orderRef);if(!orderSnap.exists)throw new Error("找不到訂單");const order=orderSnap.data();
    if(!order.reservationId)throw new Error("這是舊訂單，沒有可釋放的預留");
    const resRef=db.collection("stockReservations").doc(order.reservationId),resSnap=await tx.get(resRef);if(!resSnap.exists||resSnap.data().status!=="active")throw new Error("這筆預留已經不是啟用狀態");
    const res=resSnap.data(),balanceRef=kybReservationBalanceRef(res),balanceSnap=await tx.get(balanceRef),now=new Date().toISOString();
    writeReservationBalance(tx,balanceRef,"kyb",res.itemId,res.loc,null,reservationBalanceQty(balanceSnap)-Number(res.qty||0));tx.update(resRef,{status:"released",releasedAt:now,releasedBy:currentUser.name,releaseReason:reason});tx.update(orderRef,{reservationStatus:"released",reservationReleasedAt:now,reservationReleasedBy:currentUser.name});
  });}catch(e){alert("釋放失敗："+e.message);}
}
async function cancelKybOrder(orderId){
  if(!confirm("確定要取消這筆訂單嗎？若仍有預留量，會同時釋放。"))return;
  try{await db.runTransaction(async tx=>{
    const orderRef=db.collection("kybOrders").doc(orderId),orderSnap=await tx.get(orderRef);if(!orderSnap.exists)throw new Error("找不到訂單");const order=orderSnap.data();if(order.status!=="pending")throw new Error("只有待確認訂單可以取消");
    let resRef=null,resSnap=null,balanceRef=null,balanceSnap=null;if(order.reservationId){resRef=db.collection("stockReservations").doc(order.reservationId);resSnap=await tx.get(resRef);if(resSnap.exists&&resSnap.data().status==="active"){balanceRef=kybReservationBalanceRef(resSnap.data());balanceSnap=await tx.get(balanceRef);}}
    const now=new Date().toISOString();if(resSnap&&resSnap.exists&&resSnap.data().status==="active"){const res=resSnap.data();writeReservationBalance(tx,balanceRef,"kyb",res.itemId,res.loc,null,reservationBalanceQty(balanceSnap)-Number(res.qty||0));tx.update(resRef,{status:"released",releasedAt:now,releasedBy:currentUser.name,releaseReason:"訂單取消"});}
    tx.update(orderRef,{status:"cancelled",cancelledAt:now,cancelledBy:currentUser.name,reservationStatus:resSnap&&resSnap.exists&&resSnap.data().status==="active"?"released":order.reservationStatus||null});
  });}catch(e){alert("取消失敗："+e.message);}
}
async function confirmKybOrder(order,loc){
  return db.runTransaction(async tx=>{
    const orderRef=db.collection("kybOrders").doc(order.id),itemRef=db.collection("kybItems").doc(order.itemId),orderSnap=await tx.get(orderRef),itemSnap=await tx.get(itemRef);if(!orderSnap.exists||!itemSnap.exists)throw new Error("訂單或車型已不存在");
    const live=orderSnap.data();if(live.status!=="pending")throw new Error("這筆訂單已不是待確認狀態");
    let resRef=null,resSnap=null,res=null,oldBalanceRef=null,oldBalanceSnap=null;if(live.reservationId){resRef=db.collection("stockReservations").doc(live.reservationId);resSnap=await tx.get(resRef);if(resSnap.exists&&resSnap.data().status==="active"){res=resSnap.data();oldBalanceRef=kybReservationBalanceRef(res);}}
    const selectedBalanceRef=reservationBalanceRef("kyb",live.itemId,loc,null),selectedBalanceSnap=await tx.get(selectedBalanceRef);if(oldBalanceRef)oldBalanceSnap=oldBalanceRef.path===selectedBalanceRef.path?selectedBalanceSnap:await tx.get(oldBalanceRef);
    const item={id:live.itemId,...itemSnap.data()},physical=kybLocQty((item.locations||{})[loc]),selectedReserved=reservationBalanceQty(selectedBalanceSnap),ownReserved=res&&oldBalanceRef.path===selectedBalanceRef.path?Number(res.qty||0):0,available=physical-Math.max(0,selectedReserved-ownReserved);
    if(live.qty>available)throw new Error(`這個儲位可用庫存只剩 ${Math.max(0,available)}，請改選其他儲位`);
    const allLocs={...(item.locations||{})},next=physical-live.qty;if(next>0)allLocs[loc]=next;else delete allLocs[loc];
    const now=new Date().toISOString(),txnRef=db.collection("kybTransactions").doc();tx.update(itemRef,{locations:allLocs});tx.set(txnRef,{itemId:live.itemId,type:"out",qty:live.qty,loc,date:todayStr(),operator:currentUser.name,salesperson:live.requestedByName||"",customerName:live.customerName||"",customerContact:live.customerContact||"",customerNote:live.customerNote||"",...salesPricingStoredFields(live,live.qty),orderId:order.id,reservationId:live.reservationId||null,editLog:[],createdAt:now});
    const erpDraftRef=createErpShipmentDraft(tx,{sourceType:"kyb",transactionRef:txnRef,order:live,orderId:order.id,date:todayStr(),now});
    if(res){writeReservationBalance(tx,oldBalanceRef,"kyb",res.itemId,res.loc,null,reservationBalanceQty(oldBalanceSnap)-Number(res.qty||0));tx.update(resRef,{status:"consumed",consumedAt:now,consumedBy:currentUser.name,fulfilledLoc:loc});}
    tx.update(orderRef,{status:"confirmed",confirmedAt:now,confirmedBy:currentUser.name,linkedTxnId:txnRef.id,erpSalesOrderId:erpDraftRef.id,reservationStatus:res?"consumed":live.reservationStatus||null});return txnRef;
  });
}
async function saveKybOrderEdit(order,change){
  await db.runTransaction(async tx=>{
    const orderRef=db.collection("kybOrders").doc(order.id),itemRef=db.collection("kybItems").doc(change.itemId),orderSnap=await tx.get(orderRef),itemSnap=await tx.get(itemRef);if(!orderSnap.exists||!itemSnap.exists)throw new Error("訂單或車型已不存在");
    const live=orderSnap.data();if(live.status!=="pending")throw new Error("只有待確認訂單可以修改");
    let oldRef=null,oldSnap=null,oldRes=null,oldBalanceRef=null,oldBalanceSnap=null;if(live.reservationId){oldRef=db.collection("stockReservations").doc(live.reservationId);oldSnap=await tx.get(oldRef);if(oldSnap.exists&&oldSnap.data().status==="active"){oldRes=oldSnap.data();oldBalanceRef=kybReservationBalanceRef(oldRes);}}
    const newBalanceRef=reservationBalanceRef("kyb",change.itemId,change.loc,null),newBalanceSnap=await tx.get(newBalanceRef);if(oldBalanceRef)oldBalanceSnap=oldBalanceRef.path===newBalanceRef.path?newBalanceSnap:await tx.get(oldBalanceRef);
    const physical=kybLocQty((itemSnap.data().locations||{})[change.loc]),newReserved=reservationBalanceQty(newBalanceSnap),ownReserved=oldRes&&oldBalanceRef.path===newBalanceRef.path?Number(oldRes.qty||0):0,available=physical-Math.max(0,newReserved-ownReserved);
    if(change.qty>available)throw new Error(`新選擇的可用庫存只有 ${Math.max(0,available)}，無法預留 ${change.qty}`);
    const now=new Date().toISOString(),same=oldRes&&oldBalanceRef.path===newBalanceRef.path;let reservationRef=oldRef;
    if(same){writeReservationBalance(tx,newBalanceRef,"kyb",change.itemId,change.loc,null,newReserved-ownReserved+change.qty);tx.update(oldRef,{itemId:change.itemId,loc:change.loc,batchDate:null,qty:change.qty,reservationKey:makeReservationKey("kyb",change.itemId,change.loc,null),balanceId:newBalanceRef.id,updatedAt:now,updatedBy:currentUser.name});}
    else{if(oldRes){writeReservationBalance(tx,oldBalanceRef,"kyb",oldRes.itemId,oldRes.loc,null,reservationBalanceQty(oldBalanceSnap)-Number(oldRes.qty||0));tx.update(oldRef,{status:"released",releasedAt:now,releasedBy:currentUser.name,releaseReason:"倉管修改訂單"});}reservationRef=db.collection("stockReservations").doc();tx.set(reservationRef,{source:"kyb",orderId:order.id,itemId:change.itemId,loc:change.loc,batchDate:null,qty:change.qty,reservationKey:makeReservationKey("kyb",change.itemId,change.loc,null),balanceId:newBalanceRef.id,status:"active",reservedByUid:live.requestedByUid||"",reservedByName:live.requestedByName||"",createdAt:now,createdBy:currentUser.name});writeReservationBalance(tx,newBalanceRef,"kyb",change.itemId,change.loc,null,newReserved+change.qty);}
    tx.update(orderRef,{...change,reservationId:reservationRef.id,reservationStatus:"active",updatedAt:now,updatedBy:currentUser.name});
  });
}
async function submitKybTxn(itemId,type,qty,loc,unitCost,saleData={}){
  const itemRef=db.collection("kybItems").doc(itemId);
  await db.runTransaction(async tx=>{
    const itemSnap=await tx.get(itemRef);if(!itemSnap.exists)throw new Error("找不到車型");const item=itemSnap.data(),allLocs={...(item.locations||{})},current=kybLocQty(allLocs[loc]);
    const balanceRef=reservationBalanceRef("kyb",itemId,loc,null),balanceSnap=type==="out"?await tx.get(balanceRef):null;
    if(type==="out"){const available=current-reservationBalanceQty(balanceSnap);if(qty>available)throw new Error(`可用庫存只有 ${Math.max(0,available)}，不能扣除已預留數量`);}
    const next=type==="in"?current+qty:current-qty;if(next<0)throw new Error("庫存不足，無法出貨");if(next>0)allLocs[loc]=next;else delete allLocs[loc];
    const now=new Date().toISOString(),txnRef=db.collection("kybTransactions").doc();tx.update(itemRef,{locations:allLocs});tx.set(txnRef,{itemId,type,qty,loc,date:todayStr(),operator:currentUser.name,editLog:[],unitCost:(type==="in"&&unitCost!=null&&Number.isFinite(unitCost))?unitCost:null,...(type==="out"?{customerId:saleData.customerId||null,customerCode:saleData.customerCode||"",customerContactPerson:saleData.customerContactPerson||"",customerName:saleData.customerName||"",customerContact:saleData.customerContact||"",salesperson:saleData.salesperson||currentUser.name,...salesPricingStoredFields(saleData,qty)}:{}),createdAt:now});
  });await refreshKybViews();closeModal();
}
