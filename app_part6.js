
  await itemRef.update({locations: allLocs});
  await db.collection("kybTransactions").add({
    itemId, type, qty, loc, date: todayStr(), operator: currentUser.name, editLog: []
  });
  closeModal();
}

async function editKybTxn(txnId){
  const t = kybTxnCache.find(x=>x.id===txnId);
  if(!t) return;
  const newQty = Number(prompt(`目前數量為 ${t.qty}，請輸入修正後的數量：`, t.qty));
  if(!newQty || newQty<=0) return;
  const diff = newQty - t.qty;
  const itemRef = db.collection("kybItems").doc(t.itemId);
  const itemSnap = await itemRef.get();
  if(itemSnap.exists){
    const item = itemSnap.data();
    const allLocs = {...(item.locations||{})};
    const sign = t.type === "in" ? 1 : -1;
    const next = kybLocQty(allLocs[t.loc]) + diff*sign;
    if(next <= 0) delete allLocs[t.loc]; else allLocs[t.loc] = next;
    await itemRef.update({locations: allLocs});
  }
  await db.collection("kybTransactions").doc(txnId).update({
    qty: newQty,
    editLog: firebase.firestore.FieldValue.arrayUnion({
      before: t.qty, after: newQty, time: new Date().toISOString(), by: currentUser.name
    })
  });
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
}

function openNewKybItemModal(){
  const html = `
    <div class="sheet-head"><h2>新增車型</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>車型</label><input type="text" id="newKybModel" placeholder="例如 Altis '19~"></div>
    <div class="form-row"><label>訂價</label><input type="number" id="newKybListPrice"></div>
    <div class="form-row"><label>牌價</label><input type="number" id="newKybCatalogPrice"></div>
    <div class="form-row"><label>保修廠</label><input type="number" id="newKybWarrantyPrice"></div>
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
      carModel, brand:"KYB", remark: document.getElementById("newKybRemark").value.trim(),
      locations:{}, listPrice: toNum("newKybListPrice"), catalogPrice: toNum("newKybCatalogPrice"), warrantyPrice: toNum("newKybWarrantyPrice")
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
    orderId: order.id, editLog: []
  });
}

function openEditKybOrderModal(orderId){
  const order = kybOrdersCache.find(o=>o.id===orderId);
  if(!order) return;
  let selectedItemId = order.itemId;
  const html = `
    <div class="sheet-head"><h2>修改訂單</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row">
      <label>搜尋車型（要換車型才需要，不換不用理它）</label>
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
    listEl.innerHTML = matches.map(it=>`<div data-id="${it.id}">${escapeHtml(it.carModel)}</div>`).join("");
    listEl.classList.toggle("hidden", matches.length===0);
    listEl.querySelectorAll("div").forEach(d=>d.addEventListener("click", ()=>{
      selectedItemId = d.dataset.id;
      const it = kybItemsCache.find(i=>i.id===selectedItemId);
      document.getElementById("editKybOrderItemLabel").value = it.carModel;
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
