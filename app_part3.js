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
  if(itemSnap.exists){
    const item = itemSnap.data();
    const allLocs = {...(item.locations||{})};
    let batches = normalizeBatches(allLocs[t.loc], item).map(b=>({...b}));
    let idx = ("batchDate" in t) ? batches.findIndex(b=> (b.productionDate||null) === (t.batchDate||null)) : 0;
    if(idx < 0) idx = 0;
    if(batches.length === 0){ batches.push({ qty: 0, productionDate: t.batchDate||null }); idx = 0; }
    const sign = t.type === "in" ? 1 : -1;
    batches[idx].qty = (batches[idx].qty||0) + diff*sign;
    if(batches[idx].qty <= 0) batches.splice(idx, 1);
    allLocs[t.loc] = batches.filter(b=>b.qty>0);
    if(allLocs[t.loc].length === 0) delete allLocs[t.loc];
    await itemRef.update({locations: allLocs});
  }
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
    orderId: order.id, editLog: []
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
  if(newName === null) return;
  const roleInput = prompt("修改角色：輸入「管理者」或「員工」", u.role==='admin'?'管理者':'員工');
  if(roleInput === null) return;
  const role = roleInput.trim()==='管理者' ? 'admin' : 'member';
