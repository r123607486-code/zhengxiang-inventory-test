// ============================================================
// 輪胎：進銷貨管理 / 訂單管理 / 我的訂單
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

  // 新做的動作排越上方：優先用 createdAt(精確時間戳記)排序，沒有的舊資料用 date 當備援
  list.sort((a,b)=> (b.createdAt||b.date||"").localeCompare(a.createdAt||a.date||""));

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

  body.querySelectorAll("[data-edit]").forEach(b=>b.addEventListener("click", ()=>openEditTxnModal(b.dataset.edit)));
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
    const prodDateRow = document.getElementById("txnProdDateRow");
    if(type === "out"){
      prodDateRow.classList.add("hidden");
      document.getElementById("txnProdDate").value = "";
    } else {
      prodDateRow.classList.remove("hidden");
    }
    if(!it){ locSelect.innerHTML = `<option value="">請先選擇品項</option>`; window._txnOutOptions = []; return; }
    if(type === "out"){
      const options = locDetailList(it);
      window._txnOutOptions = options;
      if(options.length === 0){
        locSelect.innerHTML = `<option value="">這個品項目前沒有庫存可以出貨</option>`;
      } else {
        locSelect.innerHTML = options.map((o,i)=>`<option value="${i}">${escapeHtml(o.code)}${o.date?`（${escapeHtml(o.date)}）`:''}（目前${o.qty}）</option>`).join("");
      }
    } else {
      window._txnOutOptions = [];
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
  document.getElementById("txnSubmitBtn").addEventListener("click", async ()=>{
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
    try{
      await submitTxn(selectedItemId, type, qty, loc, batchDate);
    }catch(e){
      console.error("輪胎進銷貨送出失敗：", e);
      alert("送出失敗：" + (e.message || "資料庫拒絕寫入。請聯絡管理者確認 Firebase 權限。"));
    }
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
      const idx = batches.findIndex(b=> (b.productionDate||null) === enteredDate);
      if(idx>=0) batches[idx].qty += qty; else batches.push({ qty, productionDate: enteredDate });
      usedDate = enteredDate;
    } else if(batches.length === 1){
      batches[0].qty += qty;
      usedDate = batches[0].productionDate || null;
    } else {
      const idx = batches.findIndex(b=> !b.productionDate);
      if(idx>=0) batches[idx].qty += qty; else batches.push({ qty, productionDate: null });
      usedDate = null;
    }
  } else {
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
    itemId, type, qty, loc, batchDate: usedDate, date: todayStr(), operator: currentUser.name, editLog: [],
    createdAt: new Date().toISOString()
  });
  await refreshTireViews();
  closeModal();
}

// 編輯進銷貨紀錄：日期、數量、儲位、業務、客戶姓名都可以改。
// 儲位一定要從現有儲位清單選（不能自己打字），生產日期批次維持原本可填可留空的方式。
// 不管改哪個欄位，都會先把「舊紀錄」對庫存的影響完全還原，再套用「新紀錄」的影響，確保庫存數量一定會跟著正確增減。
function openEditTxnModal(txnId){
  const t = txnCache.find(x=>x.id===txnId);
  if(!t) return;
  const item = itemsCache.find(i=>i.id===t.itemId);
  const itemLabel = item ? `${item.brand} ${item.spec}（${item.model||""}）` : "(品項已刪除，仍可編輯其他資訊，但無法改儲位)";
  const html = `
    <div class="sheet-head"><h2>編輯進銷貨紀錄</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>品項</label><input type="text" value="${escapeHtml(itemLabel)}" disabled></div>
    <div class="form-row"><label>類型</label><input type="text" value="${t.type==='in'?'進貨':'銷貨'}" disabled></div>
    <div class="form-row"><label>日期</label><input type="date" id="editTxnDate" value="${escapeHtml(t.date||todayStr())}"></div>
    <div class="form-row"><label>數量</label><input type="number" id="editTxnQty" min="1" value="${t.qty}"></div>
    <div class="form-row"><label>儲位</label>
      <select id="editTxnLoc">${locationsCache.map(l=>`<option value="${escapeHtml(l.code)}" ${l.code===t.loc?'selected':''}>${escapeHtml(l.code)}</option>`).join("")}</select>
    </div>
    <div class="form-row"><label>生產日期（這批的4碼DOT代碼，留空表示不指定批次）</label><input type="text" id="editTxnBatchDate" value="${escapeHtml(t.batchDate||"")}" placeholder="例如 2523"></div>
    <div class="form-row"><label>業務</label><input type="text" id="editTxnSalesperson" value="${escapeHtml(t.salesperson||"")}"></div>
    <div class="form-row"><label>客戶姓名</label><input type="text" id="editTxnCustomerName" value="${escapeHtml(t.customerName||"")}"></div>
    <div class="form-actions">
      <button onclick="closeModal()">取消</button>
      <button class="primary" id="editTxnSaveBtn">儲存</button>
    </div>`;
  openModal(html);

  document.getElementById("editTxnSaveBtn").addEventListener("click", async ()=>{
    const newDate = document.getElementById("editTxnDate").value || todayStr();
    const newQty = Number(document.getElementById("editTxnQty").value);
    const newLoc = document.getElementById("editTxnLoc").value;
    const newBatchDate = document.getElementById("editTxnBatchDate").value.trim() || null;
    const newSalesperson = document.getElementById("editTxnSalesperson").value.trim();
    const newCustomerName = document.getElementById("editTxnCustomerName").value.trim();
    if(!newQty || newQty<=0){ alert("請輸入正確的數量"); return; }
    if(!newLoc){ alert("請選擇儲位"); return; }
    try{
      await saveEditTxn(t, { date:newDate, qty:newQty, loc:newLoc, batchDate:newBatchDate, salesperson:newSalesperson, customerName:newCustomerName });
      closeModal();
    }catch(e){
      alert("儲存失敗："+e.message);
    }
  });
}

async function saveEditTxn(t, next){
  const itemRef = db.collection("items").doc(t.itemId);
  const itemSnap = await itemRef.get();
  if(itemSnap.exists){
    const item = itemSnap.data();
    const allLocs = {...(item.locations||{})};

    // 1) 先把「舊紀錄」對庫存的影響完全還原（進貨要扣掉、銷貨要加回去）
    let oldBatches = normalizeBatches(allLocs[t.loc], item).map(b=>({...b}));
    let oldIdx = oldBatches.findIndex(b=> (b.productionDate||null) === (t.batchDate||null));
    if(oldIdx < 0){ oldBatches.push({ qty: 0, productionDate: t.batchDate||null }); oldIdx = oldBatches.length-1; }
    const oldSign = t.type === "in" ? -1 : 1;
    oldBatches[oldIdx].qty = (oldBatches[oldIdx].qty||0) + t.qty*oldSign;
    if(oldBatches[oldIdx].qty <= 0) oldBatches.splice(oldIdx, 1);
    allLocs[t.loc] = oldBatches.filter(b=>b.qty>0);
    if(allLocs[t.loc].length === 0) delete allLocs[t.loc];

    // 2) 在還原後的庫存基礎上，套用「新紀錄」的內容
    let newBatches = normalizeBatches(allLocs[next.loc], item).map(b=>({...b}));
    let newIdx = newBatches.findIndex(b=> (b.productionDate||null) === (next.batchDate||null));
    if(newIdx < 0){
      if(t.type === "out"){ throw new Error("這個儲位／批次目前沒有庫存，無法把銷貨紀錄改到這裡，請確認儲位或生產日期"); }
      newBatches.push({ qty: 0, productionDate: next.batchDate||null });
      newIdx = newBatches.length-1;
    }
    const newSign = t.type === "in" ? 1 : -1;
    const resultQty = (newBatches[newIdx].qty||0) + next.qty*newSign;
    if(t.type === "out" && resultQty < 0){
      throw new Error(`這個儲位／批次目前只有 ${newBatches[newIdx].qty||0} 條，不夠改成銷貨 ${next.qty} 條`);
    }
    newBatches[newIdx].qty = resultQty;
    if(newBatches[newIdx].qty <= 0) newBatches.splice(newIdx, 1);
    allLocs[next.loc] = newBatches.filter(b=>b.qty>0);
    if(allLocs[next.loc].length === 0) delete allLocs[next.loc];

    await itemRef.update({ locations: allLocs });
  }

  await db.collection("transactions").doc(t.id).update({
    date: next.date, qty: next.qty, loc: next.loc, batchDate: next.batchDate,
    salesperson: next.salesperson, customerName: next.customerName,
    editLog: firebase.firestore.FieldValue.arrayUnion({
      before: { date:t.date||null, qty:t.qty, loc:t.loc, batchDate:t.batchDate||null, salesperson:t.salesperson||"", customerName:t.customerName||"" },
      after: { date:next.date, qty:next.qty, loc:next.loc, batchDate:next.batchDate, salesperson:next.salesperson, customerName:next.customerName },
      time: new Date().toISOString(), by: currentUser.name
    })
  });
  await refreshTireViews();
}

async function deleteTxn(txnId){
  const t = txnCache.find(x=>x.id===txnId);
  if(!t) return;
  if(!confirm("確定要刪除這筆紀錄嗎？（會自動把庫存改回去，並保留異動歷程）")) return;
  const itemRef = db.collection("items").doc(t.itemId);
  const itemSnap = await itemRef.get();
  if(itemSnap.exists){
    const item = itemSnap.data();
    const allLocs = {...(item.locations||{})};
    let batches = normalizeBatches(allLocs[t.loc], item).map(b=>({...b}));
    let idx = ("batchDate" in t) ? batches.findIndex(b=> (b.productionDate||null) === (t.batchDate||null)) : 0;
    if(idx < 0) idx = 0;
    if(batches.length === 0){ batches.push({ qty: 0, productionDate: t.batchDate||null }); idx = 0; }
    const sign = t.type === "in" ? -1 : 1;
    batches[idx].qty = (batches[idx].qty||0) + t.qty*sign;
    if(batches[idx].qty <= 0) batches.splice(idx, 1);
    allLocs[t.loc] = batches.filter(b=>b.qty>0);
    if(allLocs[t.loc].length === 0) delete allLocs[t.loc];
    await itemRef.update({locations: allLocs});
  }
  await db.collection("editLogs").add({
    txnId, action:"delete", before:t, time:new Date().toISOString(), by:currentUser.name
  });
  await db.collection("transactions").doc(txnId).delete();
  await refreshTireViews();
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

function openConfirmOrderModal(orderId){
  const order = ordersCache.find(o=>o.id===orderId);
  if(!order) return;
  const item = itemsCache.find(i=>i.id===order.itemId);
  if(!item){ alert("找不到這個品項，可能已被刪除。請改用「修改」換一個品項，或直接取消這筆訂單。"); return; }
  const options = locDetailList(item);
  if(options.length === 0){ alert("這個品項目前沒有庫存可以出貨，請先確認庫存，或取消這筆訂單。"); return; }

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
    orderId: order.id, editLog: [],
    createdAt: new Date().toISOString()
  });
}

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
