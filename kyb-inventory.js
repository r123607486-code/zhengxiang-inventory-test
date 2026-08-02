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
    <div class="form-row"><label>客戶姓名（可輸入關鍵字搜尋並點選帶入）</label><input type="text" id="kybOrderCustomerName" autocomplete="off"><div class="autocomplete-list hidden" id="kybOrderCustomerList"></div></div>
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

  const canManage = userHasAnyRole("warehouse");
  const body = document.getElementById("kybMasterBody");
  body.innerHTML = list.map(it=>{
    const options = kybLocList(it);
    const pending = kybHasPendingStock(it);
    const locHtml = options.length
      ? options.map(o=>`<div class="loc-line${o.code===PENDING_STOCK_CODE?' loc-pending':''}" data-id="${it.id}" data-code="${escapeHtml(o.code)}">${escapeHtml(o.code)}：${o.qty}</div>`).join("")
      : `<span class="empty-inline">無庫存</span>`;
    const priceCellsHtml = PRICE_TEMPLATES.kyb.map(f=>
      `<td class="price-field-cell${canManage?' editable-cell':''}" data-id="${it.id}" data-field="${f.key}" data-label="${escapeHtml(f.label)}">${it[f.key]!=null?it[f.key]:"未填"}</td>`
    ).join("");
    return `<tr class="${pending?'row-pending':''}">
      <td>${escapeHtml(it.carModel)}${pending?'<span class="pending-tag">尚未入庫</span>':''}</td>
      <td>${escapeHtml(it.carMake||"")}</td>
      <td>${escapeHtml(it.bucketType||"")}</td>
      <td>庫存 ${kybTotalQty(it)}<br><small>預留 ${kybReservedTotal(it)}／可用 ${kybAvailableTotal(it)}</small></td>
      <td class="loc-detail-cell">${locHtml}</td>
      <td>${escapeHtml(it.yearCode||"")}</td>
      <td>${escapeHtml(it.partNo||"")}</td>
      ${priceCellsHtml}
      <td>${escapeHtml(it.remark||"")}</td>
      <td>${canManage ? `<button data-del="${it.id}" data-model="${escapeHtml(it.carModel)}">刪除</button>` : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="11" class="empty">尚無資料</td></tr>`;

  body.querySelectorAll(".loc-line").forEach(el=>{
    el.addEventListener("click", ()=> openKybLocationModal(el.dataset.id, el.dataset.code));
  });
  if(canManage){
    body.querySelectorAll(".price-field-cell").forEach(td=>{
      td.addEventListener("click", ()=> editPriceField("kybItems", kybItemsCache, td.dataset.id, td.dataset.field, td.dataset.label));
    });
    body.querySelectorAll("[data-del]").forEach(b=> b.addEventListener("click", ()=> deleteKybItem(b.dataset.del, b.dataset.model)));
  }
  window._kybMasterFilteredList = list;
}

function deleteKybItem(itemId, carModel){
  if(!userHasAnyRole("warehouse")) return;
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
  const reserved = activeReservedQty("kyb", itemId, code, null, null);
  const movableQty = Math.max(0, qty - reserved);
  const allCodes = kybLocationsCache.map(l=>l.code);

  const html = `
    <div class="sheet-head"><h2>儲位管理：${escapeHtml(code)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>目前儲位</label><input type="text" value="${escapeHtml(code)}" disabled></div>
    <div class="form-row"><label>庫存狀態</label><input type="text" value="庫存 ${qty}　已預留 ${reserved}　可搬動 ${movableQty}" disabled></div>
    <div class="form-row"><label>搬出數量（不搬就留空）</label><input type="number" id="kybMoveQty" min="1" max="${movableQty}"></div>
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
    if(moveQty > movableQty){ alert(`這個儲位可搬動量只有 ${movableQty}；已預留 ${reserved} 的數量不能搬移。`); return; }

    const newLocs = {...allLocs};
    newLocs[code] = qty - moveQty;
    newLocs[moveTarget] = kybLocQty(newLocs[moveTarget]) + moveQty;
    if(newLocs[code] <= 0) delete newLocs[code];

    db.collection("kybItems").doc(itemId).update({ locations: newLocs })
      .then(()=>closeModal())
      .catch(e=>alert("更新失敗："+e.message));
  });
}

document.getElementById("kybExportBtn").addEventListener("click", ()=>{
  const list = window._kybMasterFilteredList || [];
  const rows = list.map(it=>{
    const row = { 車型: it.carModel, 廠牌: it.carMake||"", 避震款式: it.bucketType||"", 總量: kybTotalQty(it), 儲位分布: kybLocSummary(it), 年份代碼: it.yearCode||"", 料號: it.partNo||"" };
    PRICE_TEMPLATES.kyb.forEach(f=>{ row[f.label] = it[f.key]!=null ? it[f.key] : ""; });
    row.備註 = it.remark||"";
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "資料");
  XLSX.writeFile(wb, `KYB庫存總表_篩選結果_${todayStr()}.xlsx`);
});


// ===== 第 5 批：KYB 叫貨時建立預留 =====
async function createReservedKybOrder(data){
  const orderRef=db.collection("kybOrders").doc();
  const reservationRef=db.collection("stockReservations").doc();
  const reservationKey=makeReservationKey("kyb",data.itemId,data.loc,null);
  await db.runTransaction(async tx=>{
    const itemRef=db.collection("kybItems").doc(data.itemId);
    const balanceRef=reservationBalanceRef("kyb",data.itemId,data.loc,null);
    const itemSnap=await tx.get(itemRef);
    const balanceSnap=await tx.get(balanceRef);
    if(!itemSnap.exists) throw new Error("找不到車型，請重新整理後再試一次");
    const actual=kybLocQty((itemSnap.data().locations||{})[data.loc]);
    const reserved=reservationBalanceQty(balanceSnap);
    if(data.qty>actual-reserved) throw new Error(`這個儲位可用庫存只剩 ${Math.max(0,actual-reserved)}，請重新選擇數量或儲位`);
    const now=new Date().toISOString();
    tx.set(orderRef,{...data,status:"pending",reservationId:reservationRef.id,reservationStatus:"active",requestedAt:now});
    tx.set(reservationRef,{source:"kyb",orderId:orderRef.id,itemId:data.itemId,loc:data.loc,batchDate:null,qty:data.qty,reservationKey,balanceId:balanceRef.id,status:"active",reservedByUid:currentUser.uid,reservedByName:currentUser.name,createdAt:now});
    writeReservationBalance(tx,balanceRef,"kyb",data.itemId,data.loc,null,reserved+data.qty);
  });
}
function renderKybQuery(){
  const box=document.getElementById("kybQueryResults"),countEl=document.getElementById("kybQueryCount"); if(!box||!countEl)return;
  const q=norm(document.getElementById("kybQueryBox").value); let list=kybItemsCache.slice();
  if(q) list=list.filter(it=>norm(it.carModel).includes(q)||norm(it.carMake).includes(q));
  const rank=it=>kybHasPendingStock(it)?0:(kybAvailableTotal(it)>0?1:2); list.sort((a,b)=>(rank(a)-rank(b))||kybCompareItems(a,b));
  const availableCount=list.filter(it=>kybAvailableTotal(it)>0).length;
  countEl.textContent=q?`找到 ${list.length} 筆（可用 ${availableCount} 筆）`:`共 ${list.length} 筆車型（可用 ${availableCount} 筆）`;
  box.innerHTML=list.slice(0,kybQueryVisibleCount).map(it=>{
    const physical=kybTotalQty(it),reserved=kybReservedTotal(it),available=kybAvailableTotal(it),unavailable=available<=0,pending=kybHasPendingStock(it);
    const subParts=["KYB"];if(it.bucketType)subParts.push(it.bucketType);if(it.carMake)subParts.push(it.carMake);
    return `<div class="card${unavailable?' card-nostock':''}${pending?' card-pending':''}"><div class="code-row"><div class="code">${escapeHtml(it.carModel)}${pending?'<span class="pending-tag">尚未入庫</span>':''}</div>${unavailable?'':`<button class="order-btn" data-id="${it.id}">${ICONS.cart}叫貨</button>`}</div><div class="sub">${escapeHtml(subParts.join('　'))}</div><div class="qty">庫存 ${physical}　預留 ${reserved}　<span style="color:#2e7d32;font-weight:700;">可用 ${available}</span>${it.warrantyPrice!=null?`　　保修廠價 ${it.warrantyPrice}`:""}${it.catalogPrice!=null?`　　一線消費者售價 ${it.catalogPrice}`:""}</div><div class="sub">儲位：${escapeHtml(kybLocSummary(it))}</div></div>`;
  }).join("")||`<div class="empty">查無符合的車型</div>`;
  if(list.length>kybQueryVisibleCount)box.innerHTML+=`<button id="kybQueryLoadMoreBtn" class="load-more-btn">顯示更多（還有 ${list.length-kybQueryVisibleCount} 筆，目前顯示 ${kybQueryVisibleCount} 筆）</button>`;
  box.querySelectorAll(".order-btn").forEach(b=>b.addEventListener("click",()=>openKybOrderModal(b.dataset.id)));
  const more=document.getElementById("kybQueryLoadMoreBtn");if(more)more.addEventListener("click",()=>{kybQueryVisibleCount+=200;renderKybQuery();});
}
function openKybOrderModal(itemId){
  const item=kybItemsCache.find(i=>i.id===itemId);if(!item)return;
  const options=kybLocList(item).map(o=>({...o,available:kybAvailableAt(item,o.code)})).filter(o=>o.available>0);
  const physical=kybTotalQty(item),reserved=kybReservedTotal(item),available=kybAvailableTotal(item);
  const html=`<div class="sheet-head"><h2>叫貨：${escapeHtml(item.carModel)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div><div class="form-row"><label>車型／品牌</label><input type="text" value="${escapeHtml(item.carModel)}（KYB）" disabled></div><div class="form-row"><label>庫存狀態</label><input type="text" value="實際庫存 ${physical}　已預留 ${reserved}　可用 ${available}" disabled></div><div class="form-row"><label>選擇儲位</label><select id="kybOrderLoc">${options.length?options.map((o,i)=>`<option value="${i}">${escapeHtml(o.code)}（庫存 ${o.qty}／可用 ${o.available}）</option>`).join(""):`<option value="">目前沒有可用庫存</option>`}</select></div><div class="form-row"><label>數量</label><select id="kybOrderQty"></select></div><div class="form-row"><label>客戶姓名（可輸入關鍵字搜尋並點選帶入）</label><input type="text" id="kybOrderCustomerName" autocomplete="off"><div class="autocomplete-list hidden" id="kybOrderCustomerList"></div></div><div class="form-row"><label>聯絡方式</label><input type="text" id="kybOrderCustomerContact"></div><div class="form-row"><label>備註</label><input type="text" id="kybOrderCustomerNote"></div><section class="sales-pricing-box" id="kybOrderPriceBox" data-sales-source="kyb"><div class="sales-pricing-title">銷售金額與稅別</div><div class="form-row"><label>套用價目表</label><select id="kybOrderPricePriceList"><option value="">請先選擇品項</option></select></div><div class="form-row"><label>單價</label><input type="number" min="0" step="1" inputmode="numeric" id="kybOrderPriceUnitPrice" placeholder="請輸入實際成交單價"></div><div class="form-row"><label>稅別</label><select id="kybOrderPriceTaxMode"><option value="no_tax">不計稅</option><option value="tax_included">稅內含（5%）</option><option value="tax_excluded">稅外加（5%）</option></select></div><div class="sales-pricing-summary" id="kybOrderPriceSummary"></div></section><div class="form-actions"><button onclick="closeModal()">取消</button><button class="primary" id="kybOrderSubmitBtn">送出並預留</button></div>`;
  openModal(html);
  bindOrderCustomerLookup("kybOrderCustomerName","kybOrderCustomerContact","kybOrderCustomerList");
  const orderPricing=bindSalesPricing("kybOrderPrice","kyb",()=>item,()=>Number(document.getElementById("kybOrderQty").value)||0,null,"kybOrderQty");
  const refresh=()=>{const opt=options[Number(document.getElementById("kybOrderLoc").value)],el=document.getElementById("kybOrderQty");el.innerHTML=opt?Array.from({length:opt.available},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join(""):`<option value="0">目前無可用庫存</option>`;orderPricing.refresh();};
  if(options.length)document.getElementById("kybOrderLoc").addEventListener("change",refresh);refresh();
  document.getElementById("kybOrderSubmitBtn").addEventListener("click",async()=>{
    const opt=options[Number(document.getElementById("kybOrderLoc").value)],qty=Number(document.getElementById("kybOrderQty").value),customerInput=document.getElementById("kybOrderCustomerName"),customerName=customerInput.value.trim(),customerContact=document.getElementById("kybOrderCustomerContact").value.trim(),customerNote=document.getElementById("kybOrderCustomerNote").value.trim();
    const customerId=customerInput.dataset.partyId||null,customerCode=customerInput.dataset.partyCode||"",customerContactPerson=customerInput.dataset.partyContact||"";
    if(!opt||!qty||qty<=0){alert("請選擇有可用量的儲位與數量");return;}if(!customerName){alert("請輸入客戶姓名");return;}
    let pricing;try{pricing=readSalesPricing("kybOrderPrice",qty);}catch(e){alert(e.message);return;}
     try{await createReservedKybOrder({itemId:item.id,itemLabel:`${item.carModel}（KYB）`,qty,loc:opt.code,customerId,customerCode,customerContactPerson,customerName,customerContact,customerNote,...pricing,requestedByUid:currentUser.uid,requestedByName:currentUser.name});closeModal();alert("已送出，庫存已預留，等待倉管確認出貨。");}catch(e){alert("送出失敗："+e.message);}
  });
}
