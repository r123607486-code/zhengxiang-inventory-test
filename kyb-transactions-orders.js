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
      <td>${t.type==='in'?'進貨':'銷貨'}</td>
      <td>${escapeHtml(label)}</td>
      <td>${t.qty}</td>
      <td>${escapeHtml(t.salesperson||"")}</td>
      <td>${escapeHtml(t.customerName||"")}</td>
      <td>${escapeHtml(t.operator||"")}</td>
      <td><button data-edit="${t.id}">編輯</button> <button data-del="${t.id}">刪除</button></td>
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
    try{
      await submitKybTxn(selectedItemId, type, qty, loc);
    }catch(e){
      console.error("KYB 進銷貨送出失敗：", e);
      alert("送出失敗：" + (e.message || "資料庫拒絕寫入。請聯絡管理者確認 Firebase 權限。"));
    }
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
    itemId, type, qty, loc, date: todayStr(), operator: currentUser.name, editLog: [],
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
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="editKybTxnSaveBtn">儲存</button>
    </div>`;
  openModal(html);

  document.getElementById("editKybTxnSaveBtn").addEventListener("click", async ()=>{
    const newDate = document.getElementById("editKybTxnDate").value || todayStr();
    const newQty = Number(document.getElementById("editKybTxnQty").value);
    const newLoc = document.getElementById("editKybTxnLoc").value;
    const newSalesperson = document.getElementById("editKybTxnSalesperson").value.trim();
    const newCustomerName = document.getElementById("editKybTxnCustomerName").value.trim();
    if(!newQty || newQty<=0){ alert("請輸入正確的數量"); return; }
    if(!newLoc){ alert("請選擇儲位"); return; }
    try{
      await saveEditKybTxn(t, { date:newDate, qty:newQty, loc:newLoc, salesperson:newSalesperson, customerName:newCustomerName });
      closeModal();
    }catch(e){
      alert("儲存失敗："+e.message);
    }
  });
}

async function saveEditKybTxn(t, next){
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
    editLog: firebase.firestore.FieldValue.arrayUnion({
      before: { date:t.date||null, qty:t.qty, loc:t.loc, salesperson:t.salesperson||"", customerName:t.customerName||"" },
      after: { date:next.date, qty:next.qty, loc:next.loc, salesperson:next.salesperson, customerName:next.customerName },
      time: new Date().toISOString(), by: currentUser.name
    })
  });
  await refreshKybViews();
}

async function deleteKybTxn(txnId){
  const t = kybTxnCache.find(x=>x.id===txnId);
  if(!t) return;
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
