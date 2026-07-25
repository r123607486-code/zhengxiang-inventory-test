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

document.getElementById("kybQueryBox").addEventListener("input", ()=>{ kybQueryVisibleCount = 200; renderKybQuery(); });

function renderKybQuery(){
  const box = document.getElementById("kybQueryResults");
  const countEl = document.getElementById("kybQueryCount");
  const q = norm(document.getElementById("kybQueryBox").value);

  let list = kybItemsCache.slice();
  if(q) list = list.filter(it=> norm(it.carModel).includes(q));
  const kybQuerySortRank = (it)=> kybHasPendingStock(it) ? 0 : (kybTotalQty(it)>0 ? 1 : 2);
  list.sort((a,b)=> kybQuerySortRank(a) - kybQuerySortRank(b));

  const inStockCount = list.filter(it=>kybTotalQty(it)>0).length;
  countEl.textContent = q ? `找到 ${list.length} 筆（有庫存 ${inStockCount} 筆）` : `共 ${list.length} 筆車型（有庫存 ${inStockCount} 筆）`;

  box.innerHTML = list.slice(0,kybQueryVisibleCount).map(it=>{
    const qty = kybTotalQty(it);
    const noStock = qty <= 0;
    const pending = kybHasPendingStock(it);
    return `<div class="card${noStock?' card-nostock':''}${pending?' card-pending':''}">
      <div class="code-row">
        <div class="code">${escapeHtml(it.carModel)}${pending?'<span class="pending-tag">尚未入庫</span>':''}</div>
        ${noStock ? '' : `<button class="order-btn" data-id="${it.id}">${ICONS.cart}叫貨</button>`}
      </div>
      <div class="sub">KYB</div>
      <div class="qty">庫存 ${qty}${it.listPrice!=null?`　　訂價 ${it.listPrice}`:""}${it.catalogPrice!=null?`　　牌價 ${it.catalogPrice}`:""}${it.warrantyPrice!=null?`　　保修廠 ${it.warrantyPrice}`:""}</div>
      <div class="sub">儲位：${escapeHtml(kybLocSummary(it))}</div>
    </div>`;
  }).join("") || `<div class="empty">查無符合的車型</div>`;

  if(list.length > kybQueryVisibleCount){
    box.innerHTML += `<button id="kybQueryLoadMoreBtn" class="load-more-btn">顯示更多（還有 ${list.length - kybQueryVisibleCount} 筆，目前顯示 ${kybQueryVisibleCount} 筆）</button>`;
  }

  box.querySelectorAll(".order-btn").forEach(b=>{
    b.addEventListener("click", ()=> openKybOrderModal(b.dataset.id));
  });
  const kybQueryLoadMoreBtn = document.getElementById("kybQueryLoadMoreBtn");
  if(kybQueryLoadMoreBtn) kybQueryLoadMoreBtn.addEventListener("click", ()=>{ kybQueryVisibleCount += 200; renderKybQuery(); });
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

document.getElementById("kybMasterBox").addEventListener("input", renderKybMaster);

function renderKybMaster(){
  const q = norm(document.getElementById("kybMasterBox").value);
  let list = kybItemsCache.slice();
  if(q) list = list.filter(it=> norm(it.carModel).includes(q));
  const kybMasterSortRank = (it)=> kybHasPendingStock(it) ? 0 : (kybTotalQty(it)>0 ? 1 : 2);
  list.sort((a,b)=> kybMasterSortRank(a) - kybMasterSortRank(b));

  document.getElementById("kybMasterCount").textContent = `共 ${list.length} 筆`;

  const body = document.getElementById("kybMasterBody");
  body.innerHTML = list.map(it=>{
    const options = kybLocList(it);
    const pending = kybHasPendingStock(it);
    const locHtml = options.length
      ? options.map(o=>`<div class="loc-line${o.code===PENDING_STOCK_CODE?' loc-pending':''}" data-id="${it.id}" data-code="${escapeHtml(o.code)}">${escapeHtml(o.code)}：${o.qty}</div>`).join("")
      : `<span class="empty-inline">無庫存</span>`;
    return `<tr class="${pending?'row-pending':''}">
      <td>${escapeHtml(it.carModel)}${pending?'<span class="pending-tag">尚未入庫</span>':''}</td>
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
