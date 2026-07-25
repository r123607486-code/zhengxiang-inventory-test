
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

  const kybItemsSnap = await db.collection("kybItems").get();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kybItemsSnap.docs.map(d=>{
    const it = {id:d.id, ...d.data()};
    return {
      id: it.id, 車型: it.carModel, 品牌: "KYB", 總量: kybTotalQty(it),
      儲位分布: kybLocSummary(it), 訂價: it.listPrice!=null?it.listPrice:"", 牌價: it.catalogPrice!=null?it.catalogPrice:"",
      保修廠: it.warrantyPrice!=null?it.warrantyPrice:"", 備註: it.remark||""
    };
  })), "KYB品項主檔");
  const kybLocSnap = await db.collection("kybLocations").get();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kybLocSnap.docs.map(d=>({儲位代碼:d.data().code}))), "KYB儲位主檔");
  const kybTxnSnap = await db.collection("kybTransactions").get();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kybTxnSnap.docs.map(d=>d.data())), "KYB進出貨紀錄");

  XLSX.writeFile(wb, `完整備份_${todayStr()}.xlsx`);
}

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
