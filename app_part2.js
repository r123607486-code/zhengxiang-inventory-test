// ============================================================
// 庫存總表
// ============================================================
let masterExpireYears = null;
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

  let list = itemsCache.slice();
  if(q) list = list.filter(it=> norm(it.spec).includes(q) || norm(it.model).includes(q) || norm(it.brand).includes(q));
  const masterSortRank = (it)=> hasPendingStock(it) ? 0 : (totalQty(it)>0 ? 1 : 2);
  list.sort((a,b)=> masterSortRank(a) - masterSortRank(b));

  document.getElementById("masterCount").textContent = `共 ${list.length} 筆`
    + (masterExpireYears ? `　（反紅門檻：超過 ${masterExpireYears} 年）` : "");

  const body = document.getElementById("masterBody");
  body.innerHTML = list.map(it=>{
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
      <td>${escapeHtml(it.model||"")}${pending?'<span class="pending-tag">尚未入庫</span>':''}</td>
      <td>${escapeHtml(it.spec)}</td>
      <td>${totalQty(it)}</td>
      <td class="loc-detail-cell">${locHtml}</td>
      <td class="twenty-cell${currentUser.role==='admin'?' editable-cell':''}" data-id="${it.id}">${it.twenty!=null?it.twenty:"未填"}</td>
      <td class="price-cell${currentUser.role==='admin'?' editable-cell':''}" data-id="${it.id}">${it.sellPrice!=null?it.sellPrice:"未填"}</td>
      <td>${escapeHtml(it.remark||"")}</td>
      <td>${currentUser.role==='admin' ? `<button data-del="${it.id}" data-label="${escapeHtml(it.brand)} ${escapeHtml(it.spec)}">刪除</button>` : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="empty">尚無資料</td></tr>`;

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
    body.querySelectorAll("[data-del]").forEach(b=>{
      b.addEventListener("click", ()=> deleteItem(b.dataset.del, b.dataset.label));
    });
  }

  window._masterFilteredList = list;
}

function deleteItem(itemId, label){
  if(currentUser.role !== "admin") return;
  const item = itemsCache.find(i=>i.id===itemId);
  if(!item) return;
  const qty = totalQty(item);
  if(qty > 0){
    alert(`「${label}」目前還有庫存（共 ${qty}），請先到儲位管理把庫存搬空或歸零，再刪除這個品項。`);
    return;
  }
  if(!confirm(`確定要刪除品項「${label}」嗎？此動作無法復原。`)) return;
  db.collection("items").doc(itemId).delete()
    .catch(e=>alert("刪除失敗："+e.message));
}

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
