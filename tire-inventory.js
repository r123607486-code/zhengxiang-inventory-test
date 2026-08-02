// ============================================================
// 輪胎：庫存查詢 / 庫存總表 / 儲位與價格編輯 / 匯出
// ------------------------------------------------------------
// 叫貨流程：查詢頁的「叫貨」只把品項加進購物車（order-cart.js），
// 客戶資料與實際送出、庫存預留都在購物車結帳時一次完成。
// ============================================================
document.getElementById("queryBox").addEventListener("input", ()=>{ queryVisibleCount = 200; renderQuery(); });

function renderQuery(){
  const box=document.getElementById("queryResults"), countEl=document.getElementById("queryCount");
  if(!box||!countEl) return;
  const q=norm(document.getElementById("queryBox").value);
  let list=itemsCache.slice();
  if(q) list=list.filter(it=>norm(it.spec).includes(q)||norm(it.model).includes(q)||norm(it.brand).includes(q));
  const sortRank=it=>hasPendingStock(it)?0:(tireAvailableTotal(it)>0?1:2);
  list.sort((a,b)=>sortRank(a)-sortRank(b));
  const inStockCount=list.filter(it=>tireAvailableTotal(it)>0).length;
  countEl.textContent=q?`找到 ${list.length} 筆（可用 ${inStockCount} 筆）`:`共 ${list.length} 筆品項（可用 ${inStockCount} 筆）`;
  box.innerHTML=list.slice(0,queryVisibleCount).map(it=>{
    const physical=totalQty(it), reserved=tireReservedTotal(it), available=tireAvailableTotal(it);
    const unavailable=available<=0, pending=hasPendingStock(it);
    return `<div class="card${unavailable?' card-nostock':''}${pending?' card-pending':''}">
      <div class="code-row"><div class="code">${escapeHtml(it.spec)}${pending?'<span class="pending-tag">尚未入庫</span>':''}</div>
      ${unavailable?'':`<button class="order-btn" data-id="${it.id}">${ICONS.cart}加入購物車</button>`}</div>
      <div class="sub">${escapeHtml(it.brand)}　${escapeHtml(it.model||"")}</div>
      <div class="qty">庫存 ${physical}　預留 ${reserved}　<span style="color:#2e7d32;font-weight:700;">可用 ${available}</span>${it.twenty!=null?`　　20% ${it.twenty}`:""}${it.sellPrice!=null?`　　售價 ${it.sellPrice}`:""}</div>
      <div class="sub">儲位：${escapeHtml(locSummary(it))}</div></div>`;
  }).join("")||`<div class="empty">查無符合的品項</div>`;
  if(list.length>queryVisibleCount) box.innerHTML+=`<button id="queryLoadMoreBtn" class="load-more-btn">顯示更多（還有 ${list.length-queryVisibleCount} 筆，目前顯示 ${queryVisibleCount} 筆）</button>`;
  box.querySelectorAll(".order-btn").forEach(b=>b.addEventListener("click",()=>openOrderModal(b.dataset.id)));
  const more=document.getElementById("queryLoadMoreBtn"); if(more) more.addEventListener("click",()=>{queryVisibleCount+=200;renderQuery();});
}

// 加入購物車：這裡只決定「哪個品項、哪個批次、幾條、多少錢」，不問客戶、也還不會預留庫存。
function openOrderModal(itemId){
  const item=itemsCache.find(i=>i.id===itemId); if(!item) return;
  const options=locDetailList(item).map(o=>({...o,available:tireAvailableAt(item,o.code,o.date)})).filter(o=>o.available>0);
  const physical=totalQty(item), reserved=tireReservedTotal(item), available=tireAvailableTotal(item);
  const html=`<div class="sheet-head"><h2>加入購物車：${escapeHtml(item.spec)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>品牌／型號</label><input type="text" value="${escapeHtml(item.brand)} ${escapeHtml(item.model||'')}" disabled></div>
    <div class="form-row"><label>庫存狀態</label><input type="text" value="實際庫存 ${physical}　已預留 ${reserved}　可用 ${available}" disabled></div>
    <div class="form-row"><label>選擇儲位／批次</label><select id="orderLoc">${options.length?options.map((o,i)=>`<option value="${i}">${escapeHtml(o.code)}${o.date?`（${escapeHtml(o.date)}）`:''}（庫存 ${o.qty}／可用 ${o.available}）</option>`).join(""):`<option value="">目前沒有可用庫存</option>`}</select></div>
    <div class="form-row"><label>數量</label><select id="orderQty"></select></div>
    <section class="sales-pricing-box" id="tireOrderPriceBox" data-sales-source="tire"><div class="sales-pricing-title">銷售金額與稅別</div><div class="form-row"><label>套用價目表</label><select id="tireOrderPricePriceList"><option value="">請先選擇品項</option></select></div><div class="form-row"><label>單價</label><input type="number" min="0" step="1" inputmode="numeric" id="tireOrderPriceUnitPrice" placeholder="請輸入實際成交單價"></div><div class="form-row"><label>稅別</label><select id="tireOrderPriceTaxMode"><option value="no_tax">不計稅</option><option value="tax_included">稅內含（5%）</option><option value="tax_excluded">稅外加（5%）</option></select></div><div class="sales-pricing-summary" id="tireOrderPriceSummary"></div></section>
    <div class="note">客戶資料在購物車結帳時填一次就好。按下「加入購物車」還不會預留庫存，要按送出才會。</div>
    <div class="form-actions"><button onclick="closeModal()">取消</button><button class="primary" id="orderSubmitBtn">加入購物車</button></div>`;
  openModal(html);
  const orderPricing=bindSalesPricing("tireOrderPrice","tire",()=>item,()=>Number(document.getElementById("orderQty").value)||0,null,"orderQty");
  const refresh=()=>{const opt=options[Number(document.getElementById("orderLoc").value)], el=document.getElementById("orderQty"); el.innerHTML=opt?Array.from({length:opt.available},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join(""):`<option value="0">目前無可用庫存</option>`;orderPricing.refresh();};
  if(options.length) document.getElementById("orderLoc").addEventListener("change",refresh); refresh();
  document.getElementById("orderSubmitBtn").addEventListener("click",()=>{
    const opt=options[Number(document.getElementById("orderLoc").value)], qty=Number(document.getElementById("orderQty").value);
    if(!opt||!qty||qty<=0){alert("請選擇有可用量的儲位與數量");return;}
    let pricing;try{pricing=readSalesPricing("tireOrderPrice",qty);}catch(e){alert(e.message);return;}
    addOrderCartLine({
      source:"tire", itemId:item.id, itemLabel:`${item.brand} ${item.spec}（${item.model||""}）`,
      qty, loc:opt.code, batchDate:opt.date||null, ...pricing
    });
    closeModal();
  });
}

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

  const canManage = userHasAnyRole("warehouse");
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
    const priceCellsHtml = PRICE_TEMPLATES.tire.map(f=>
      `<td class="price-field-cell${canManage?' editable-cell':''}" data-id="${it.id}" data-field="${f.key}" data-label="${escapeHtml(f.label)}">${it[f.key]!=null?it[f.key]:"未填"}</td>`
    ).join("");
    return `<tr class="${rowExpired?'expire':''} ${pending?'row-pending':''}">
      <td>${escapeHtml(it.brand)}</td>
      <td>${escapeHtml(it.model||"")}${pending?'<span class="pending-tag">尚未入庫</span>':''}</td>
      <td>${escapeHtml(it.spec)}</td>
      <td>庫存 ${totalQty(it)}<br><small>預留 ${tireReservedTotal(it)}／可用 ${tireAvailableTotal(it)}</small></td>
      <td class="loc-detail-cell">${locHtml}</td>
      ${priceCellsHtml}
      <td>${escapeHtml(it.remark||"")}</td>
      <td>${canManage ? `<button data-del="${it.id}" data-label="${escapeHtml(it.brand)} ${escapeHtml(it.spec)}">刪除</button>` : ""}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="9" class="empty">尚無資料</td></tr>`;

  body.querySelectorAll(".loc-line").forEach(el=>{
    el.addEventListener("click", ()=> openLocationModal(el.dataset.id, el.dataset.code, Number(el.dataset.idx)));
  });
  if(canManage){
    body.querySelectorAll(".price-field-cell").forEach(td=>{
      td.addEventListener("click", ()=> editPriceField("items", itemsCache, td.dataset.id, td.dataset.field, td.dataset.label));
    });
    body.querySelectorAll("[data-del]").forEach(b=>{
      b.addEventListener("click", ()=> deleteItem(b.dataset.del, b.dataset.label));
    });
  }

  window._masterFilteredList = list;
}

function deleteItem(itemId, label){
  if(!userHasAnyRole("warehouse")) return;
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
  const reserved = activeReservedQty("tire", itemId, code, date, null);
  const movableQty = Math.max(0, qty - reserved);
  const allCodes = locationsCache.map(l=>l.code);

  const html = `
    <div class="sheet-head"><h2>儲位管理：${escapeHtml(code)}</h2><button class="sheet-close" onclick="closeModal()">✕</button></div>
    <div class="form-row"><label>目前儲位</label><input type="text" value="${escapeHtml(code)}" disabled></div>
    <div class="form-row"><label>這一批庫存狀態</label><input type="text" value="庫存 ${qty}　已預留 ${reserved}　可搬動 ${movableQty}" disabled></div>
    <div class="form-row"><label>這一批生產日期（4碼DOT代碼，例如2523；留空表示未填）</label><input type="text" id="locEditDate" value="${escapeHtml(date)}"></div>
    <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
    <div class="form-row"><label>搬出／拆出數量（不搬就留空）</label><input type="number" id="locMoveQty" min="1" max="${movableQty}"></div>
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
    if(moveQty > movableQty){ alert(`這一批可搬動量只有 ${movableQty}；已預留 ${reserved} 的數量不能搬移。`); return; }

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

document.getElementById("exportFilteredBtn").addEventListener("click", ()=>{
  exportItemsToExcel(window._masterFilteredList || [], "庫存總表_篩選結果");
});

function exportItemsToExcel(list, filename){
  const rows = list.map(it=>{
    const row = { 品牌: it.brand, 型號: it.model, 規格: it.spec, 總量: totalQty(it), 儲位分布: locSummary(it) };
    PRICE_TEMPLATES.tire.forEach(f=>{ row[f.label] = it[f.key]!=null ? it[f.key] : ""; });
    row.備註 = it.remark||"";
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "資料");
  XLSX.writeFile(wb, `${filename}_${todayStr()}.xlsx`);
}
