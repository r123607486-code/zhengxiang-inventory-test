// ============================================================
// KYB：庫存查詢 / 庫存總表 / 儲位與價格編輯 / 匯出
// ============================================================
document.getElementById("kybQueryBox").addEventListener("input", ()=>{ kybQueryVisibleCount = 200; renderKybQuery(); });

const KYB_BUCKET_ORDER = { "白桶": 0, "藍桶": 1, "深藍桶": 2 };
function kybBucketRank(it){
  const r = KYB_BUCKET_ORDER[it.bucketType];
  return r === undefined ? 99 : r;
}
function kybCompareItems(a, b){
  const bucketDiff = kybBucketRank(a) - kybBucketRank(b);
  if(bucketDiff !== 0) return bucketDiff;
  const makeDiff = norm(a.carMake||"").localeCompare(norm(b.carMake||""));
  if(makeDiff !== 0) return makeDiff;
  return norm(a.carModel||"").localeCompare(norm(b.carModel||""));
}
// 搜尋清單／已選項目要顯示的完整標籤：車型＋避震款式＋廠牌，避免同車型不同桶色時混淆
function kybItemLabel(it){
  const tag = [it.bucketType, it.carMake].filter(Boolean).join(' ');
  return tag ? `${it.carModel}　${tag}` : it.carModel;
}

function renderKybQuery(){
  const box = document.getElementById("kybQueryResults");
  const countEl = document.getElementById("kybQueryCount");
  const q = norm(document.getElementById("kybQueryBox").value);

  let list = kybItemsCache.slice();
  if(q) list = list.filter(it=> norm(it.carModel).includes(q) || norm(it.carMake).includes(q));
  const kybQuerySortRank = (it)=> kybHasPendingStock(it) ? 0 : (kybTotalQty(it)>0 ? 1 : 2);
  list.sort((a,b)=> (kybQuerySortRank(a) - kybQuerySortRank(b)) || kybCompareItems(a,b));

  const inStockCount = list.filter(it=>kybTotalQty(it)>0).length;
  countEl.textContent = q ? `找到 ${list.length} 筆（有庫存 ${inStockCount} 筆）` : `共 ${list.length} 筆車型（有庫存 ${inStockCount} 筆）`;

  box.innerHTML = list.slice(0,kybQueryVisibleCount).map(it=>{
    const qty = kybTotalQty(it);
    const noStock = qty <= 0;
    const pending = kybHasPendingStock(it);
    const subParts = ["KYB"];
    if(it.bucketType) subParts.push(it.bucketType);
    if(it.carMake) subParts.push(it.carMake);
    return `<div class="card${noStock?' card-nostock':''}${pending?' card-pending':''}">
      <div class="code-row">
        <div class="code">${escapeHtml(it.carModel)}${pending?'<span class="pending-tag">尚未入庫</span>':''}</div>
        ${noStock ? '' : `<button class="order-btn" data-id="${it.id}">${ICONS.cart}叫貨</button>`}
      </div>
      <div class="sub">${escapeHtml(subParts.join('　'))}</div>
      <div class="qty">庫存 ${qty}${it.warrantyPrice!=null?`　　保修廠價 ${it.warrantyPrice}`:""}${it.catalogPrice!=null?`　　一線消費者售價 ${it.catalogPrice}`:""}</div>
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
  if(q) list = list.filter(it=> norm(it.carModel).includes(q) || norm(it.carMake).includes(q));
  const kybMasterSortRank = (it)=> kybHasPendingStock(it) ? 0 : (kybTotalQty(it)>0 ? 1 : 2);
  list.sort((a,b)=> (kybMasterSortRank(a) - kybMasterSortRank(b)) || kybCompareItems(a,b));

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
      <td>${escapeHtml(it.carMake||"")}</td>
      <td>${escapeHtml(it.bucketType||"")}</td>
      <td>${kybTotalQty(it)}</td>
      <td class="loc-detail-cell">${locHtml}</td>
      <td>${escapeHtml(it.yearCode||"")}</td>
      <td>${escapeHtml(it.partNo||"")}</td>
      <td class="editable-cell kyb-warranty-cell" data-id="${it.id}">${it.warrantyPrice!=null?it.warrantyPrice:"未填"}</td>
      <td class="editable-cell kyb-catalog-cell" data-id="${it.id}">${it.catalogPrice!=null?it.catalogPrice:"未填"}</td>
      <td>${escapeHtml(it.remark||"")}</td>
      <td>${currentUser.role==='admin' ? `<button data-del="${it.id}" data-model="${escapeHtml(it.carModel)}">刪除</button>` : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="11" class="empty">尚無資料</td></tr>`;

  body.querySelectorAll(".loc-line").forEach(el=>{
    el.addEventListener("click", ()=> openKybLocationModal(el.dataset.id, el.dataset.code));
  });
  if(currentUser.role === "admin"){
    body.querySelectorAll(".kyb-catalog-cell").forEach(td=> td.addEventListener("click", ()=> editKybPrice(td.dataset.id, "catalogPrice", "一線消費者售價")));
    body.querySelectorAll(".kyb-warranty-cell").forEach(td=> td.addEventListener("click", ()=> editKybPrice(td.dataset.id, "warrantyPrice", "保修廠價")));
    body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", ()=> deleteKybItem(b.dataset.del, b.dataset.model)));
  } else {
    body.querySelectorAll(".kyb-catalog-cell,.kyb-warranty-cell").forEach(td=> td.classList.remove("editable-cell"));
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
    車型: it.carModel, 廠牌: it.carMake||"", 避震款式: it.bucketType||"", 總量: kybTotalQty(it), 儲位分布: kybLocSummary(it),
    年份代碼: it.yearCode||"", 料號: it.partNo||"",
    保修廠價: it.warrantyPrice!=null?it.warrantyPrice:"", 一線消費者售價: it.catalogPrice!=null?it.catalogPrice:"", 備註: it.remark||""
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "資料");
  XLSX.writeFile(wb, `KYB庫存總表_篩選結果_${todayStr()}.xlsx`);
});
