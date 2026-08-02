// ERP 成本與毛利報表。
// 只讀取既有輪胎／KYB 進銷貨資料；不新增、不修改庫存或帳務資料。
// 成本以實際「進貨」交易填寫的 unitCost 為準，依交易時間計算移動平均成本。

let erpProfitabilityFilter={from:"",to:"",source:"all"};

function erpProfitabilityNumber(value){
  const number=Number(value);
  return Number.isFinite(number)?number:0;
}
function erpProfitabilityEventTime(transaction){
  const value=transaction&&transaction.createdAt;
  if(value&&typeof value.toMillis==="function") return value.toMillis();
  if(value&&typeof value.toDate==="function") return value.toDate().getTime();
  if(typeof value==="number"&&Number.isFinite(value)) return value;
  const parsed=value?Date.parse(String(value)):NaN;
  if(Number.isFinite(parsed)) return parsed;
  const fallback=transaction&&transaction.date?Date.parse(String(transaction.date)+"T00:00:00"):NaN;
  return Number.isFinite(fallback)?fallback:0;
}
function erpProfitabilityDate(transaction){
  if(transaction&&transaction.date) return String(transaction.date).slice(0,10);
  const time=erpProfitabilityEventTime(transaction);
  return time?new Date(time).toISOString().slice(0,10):"";
}
function erpProfitabilityItemName(source,itemId){
  if(source==="tire"){
    const item=erpTireItemsCache.find(entry=>entry.id===itemId);
    if(item) return [item.brand,item.spec,item.model?("（"+item.model+"）"):""].filter(Boolean).join(" ")||"輪胎品項";
    return "輪胎品項（主檔已刪除）";
  }
  const item=erpKybItemsCache.find(entry=>entry.id===itemId);
  if(item) return item.carModel||item.itemLabel||"KYB 品項";
  return "KYB 品項（主檔已刪除）";
}
function erpProfitabilitySourceLabel(source){
  return source==="tire"?"輪胎":"KYB";
}
function erpProfitabilityTransactions(){
  const collect=(source,list)=>list.map(transaction=>({
    ...transaction,
    _profitSource:source,
    _profitKey:source+":"+(transaction.itemId||""),
    _profitDate:erpProfitabilityDate(transaction),
    _profitTime:erpProfitabilityEventTime(transaction),
    _profitItemName:erpProfitabilityItemName(source,transaction.itemId||"")
  }));
  return collect("tire",erpTireTransactionsCache)
    .concat(collect("kyb",erpKybTransactionsCache))
    .sort((a,b)=>a._profitTime-b._profitTime||String(a.id||"").localeCompare(String(b.id||"")));
}
function erpProfitabilityRevenue(transaction){
  const hasStoredAmount=transaction.subtotalAmount!==undefined||transaction.lineAmount!==undefined||transaction.unitPrice!==undefined;
  if(!hasStoredAmount) return {known:false,amount:0};
  if(transaction.subtotalAmount!==undefined) return {known:true,amount:Math.round(erpProfitabilityNumber(transaction.subtotalAmount))};
  const quantity=erpProfitabilityNumber(transaction.qty);
  const unitPrice=erpProfitabilityNumber(transaction.unitPrice);
  const totals=salesPricingTotals({
    lineAmount:transaction.lineAmount!==undefined?erpProfitabilityNumber(transaction.lineAmount):quantity*unitPrice,
    taxMode:transaction.taxMode||"no_tax"
  });
  return {known:true,amount:Math.round(erpProfitabilityNumber(totals.subtotal))};
}
function erpProfitabilityNewState(transaction){
  return {
    key:transaction._profitKey,
    source:transaction._profitSource,
    itemId:transaction.itemId||"",
    itemName:transaction._profitItemName,
    stockQty:0,
    stockValue:0,
    unknownCostQty:0
  };
}
function erpProfitabilityReduceStock(state,quantity){
  const beforeQty=state.stockQty;
  const costKnown=beforeQty>=quantity&&state.unknownCostQty===0&&beforeQty>0;
  const unitCost=costKnown?state.stockValue/beforeQty:null;
  const amount=costKnown?unitCost*quantity:null;
  if(beforeQty>0){
    const ratio=Math.min(1,quantity/beforeQty);
    state.stockValue=Math.max(0,state.stockValue*(1-ratio));
  }
  state.stockQty=Math.max(0,beforeQty-quantity);
  state.unknownCostQty=Math.max(0,state.unknownCostQty-quantity);
  return {known:costKnown,unitCost,amount};
}
function erpProfitabilityBuild(){
  const states=new Map(),sales=[];
  erpProfitabilityTransactions().forEach(transaction=>{
    const quantity=Math.max(0,erpProfitabilityNumber(transaction.qty));
    if(!quantity||!transaction.itemId) return;
    let state=states.get(transaction._profitKey);
    if(!state){
      state=erpProfitabilityNewState(transaction);
      states.set(transaction._profitKey,state);
    }
    state.itemName=transaction._profitItemName||state.itemName;
    if(transaction.type==="in"){
      state.stockQty+=quantity;
      const cost=Number(transaction.unitCost);
      if(Number.isFinite(cost)&&cost>=0) state.stockValue+=quantity*cost;
      else state.unknownCostQty+=quantity;
      return;
    }
    if(transaction.type==="sales_return"){
      // 既有退貨異動沒有保存原始出貨成本，先標記為成本待補，避免虛報毛利。
      state.stockQty+=quantity;
      state.unknownCostQty+=quantity;
      return;
    }
    if(transaction.type!=="out"&&transaction.type!=="sales_return_void") return;
    const cost=erpProfitabilityReduceStock(state,quantity);
    if(transaction.type!=="out") return;
    const revenue=erpProfitabilityRevenue(transaction);
    sales.push({
      id:transaction.id||"",
      date:transaction._profitDate,
      eventTime:transaction._profitTime,
      source:transaction._profitSource,
      itemId:transaction.itemId||"",
      itemName:transaction._profitItemName,
      quantity,
      customerName:(transaction.customerName||"未填客戶").trim()||"未填客戶",
      salesperson:(transaction.salesperson||transaction.operator||"未填業務").trim()||"未填業務",
      revenueKnown:revenue.known,
      revenue:revenue.amount,
      costKnown:cost.known,
      cost:cost.amount==null?0:cost.amount,
      unitCost:cost.unitCost,
      grossProfit:revenue.known&&cost.known?revenue.amount-cost.amount:null
    });
  });
  return {states:[...states.values()],sales};
}
function erpProfitabilityInRange(row){
  const date=row.date||"";
  if(erpProfitabilityFilter.from&&date<erpProfitabilityFilter.from) return false;
  if(erpProfitabilityFilter.to&&date>erpProfitabilityFilter.to) return false;
  if(erpProfitabilityFilter.source!=="all"&&row.source!==erpProfitabilityFilter.source) return false;
  return true;
}
function erpProfitabilitySummary(rows){
  return rows.reduce((summary,row)=>{
    summary.salesCount++;
    summary.quantity+=row.quantity;
    if(row.revenueKnown) summary.revenue+=row.revenue;
    else summary.missingRevenue++;
    if(row.costKnown) summary.cost+=row.cost;
    else summary.missingCost++;
    if(row.revenueKnown&&row.costKnown){
      summary.completeRevenue+=row.revenue;
      summary.grossProfit+=row.grossProfit;
      summary.completeCount++;
    }
    return summary;
  },{salesCount:0,quantity:0,revenue:0,cost:0,completeRevenue:0,grossProfit:0,completeCount:0,missingRevenue:0,missingCost:0});
}
function erpProfitabilityGroup(rows,key,emptyLabel){
  const groups=new Map();
  rows.forEach(row=>{
    const label=(row[key]||emptyLabel).trim()||emptyLabel;
    let group=groups.get(label);
    if(!group){
      group={label,salesCount:0,quantity:0,revenue:0,cost:0,completeRevenue:0,grossProfit:0,missingRevenue:0,missingCost:0};
      groups.set(label,group);
    }
    group.salesCount++;
    group.quantity+=row.quantity;
    if(row.revenueKnown) group.revenue+=row.revenue; else group.missingRevenue++;
    if(row.costKnown) group.cost+=row.cost; else group.missingCost++;
    if(row.revenueKnown&&row.costKnown){
      group.completeRevenue+=row.revenue;
      group.grossProfit+=row.grossProfit;
    }
  });
  return [...groups.values()].sort((a,b)=>b.grossProfit-a.grossProfit||b.revenue-a.revenue||a.label.localeCompare(b.label,"zh-Hant"));
}
function erpProfitabilityRate(group){
  return group.completeRevenue>0?Math.round(group.grossProfit/group.completeRevenue*1000)/10:null;
}
function erpProfitabilityCompleteness(group){
  const missing=(group.missingRevenue||0)+(group.missingCost||0);
  if(!missing) return '<span class="erp-status erp-status-confirmed">完整</span>';
  const messages=[];
  if(group.missingCost) messages.push("成本待補 "+group.missingCost+" 筆");
  if(group.missingRevenue) messages.push("售價待補 "+group.missingRevenue+" 筆");
  return '<span class="erp-form-hint">'+erpEscape(messages.join("｜"))+'</span>';
}
function erpProfitabilityGroupTable(title,groups){
  return '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">GROSS PROFIT BY DIMENSION</p><h2>'+erpEscape(title)+'</h2></div><span class="erp-counter">'+groups.length+' 組</span></div>'
    +(groups.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>名稱</th><th>銷貨數量</th><th>未稅銷貨額</th><th>已知成本</th><th>已知毛利</th><th>毛利率</th><th>資料狀態</th></tr></thead><tbody>'
      +groups.map(group=>'<tr><td><strong>'+erpEscape(group.label)+'</strong></td><td>'+erpMoney(group.quantity)+'</td><td>NT$ '+erpMoney(group.revenue)+'</td><td>NT$ '+erpMoney(group.cost)+'</td><td><strong>NT$ '+erpMoney(group.grossProfit)+'</strong></td><td>'+(erpProfitabilityRate(group)==null?"—":erpProfitabilityRate(group)+"%")+'</td><td>'+erpProfitabilityCompleteness(group)+'</td></tr>').join("")
      +'</tbody></table></div>':'<div class="erp-empty">此條件下尚無銷貨資料。</div>')
    +'</section>';
}
function erpProfitabilityInventoryTable(states){
  const rows=states.filter(state=>state.stockQty>0||state.stockValue>0).sort((a,b)=>a.itemName.localeCompare(b.itemName,"zh-Hant"));
  return '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">MOVING AVERAGE COST</p><h2>目前移動平均成本</h2><p>僅依已填寫進價的實際庫存異動計算；缺少進價或舊退貨會標示待補。</p></div><span class="erp-counter">'+rows.length+' 項</span></div>'
    +(rows.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>來源</th><th>品項</th><th>依異動推算庫存</th><th>成本狀態</th><th>移動平均成本</th><th>推算庫存成本</th></tr></thead><tbody>'
      +rows.map(state=>{
        const complete=state.unknownCostQty===0;
        const average=complete&&state.stockQty>0?state.stockValue/state.stockQty:null;
        return '<tr><td><span class="erp-source-tag '+erpEscape(state.source)+'">'+erpProfitabilitySourceLabel(state.source)+'</span></td><td><strong>'+erpEscape(state.itemName)+'</strong></td><td>'+erpMoney(state.stockQty)+'</td><td>'+(complete?'<span class="erp-status erp-status-confirmed">完整</span>':'<span class="erp-form-hint">進價待補 '+erpMoney(state.unknownCostQty)+' 件</span>')+'</td><td>'+(average==null?"—":"NT$ "+erpMoney(average))+'</td><td>'+(complete?"NT$ "+erpMoney(state.stockValue):"—")+'</td></tr>';
      }).join("")
      +'</tbody></table></div>':'<div class="erp-empty">尚無可計算成本的庫存異動。</div>')
    +'</section>';
}
function erpProfitabilitySalesTable(rows){
  const latest=rows.slice().sort((a,b)=>b.eventTime-a.eventTime).slice(0,100);
  return '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">SALE COST DETAIL</p><h2>銷貨成本明細</h2><p>最多顯示最近 100 筆；毛利以未稅銷貨額計算。</p></div><span class="erp-counter">'+rows.length+' 筆</span></div>'
    +(latest.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>日期</th><th>來源</th><th>品項</th><th>客戶</th><th>業務</th><th>數量</th><th>未稅銷貨額</th><th>銷貨成本</th><th>毛利</th><th>狀態</th></tr></thead><tbody>'
      +latest.map(row=>{
        const complete=row.revenueKnown&&row.costKnown;
        return '<tr><td>'+erpEscape(row.date||"-")+'</td><td><span class="erp-source-tag '+erpEscape(row.source)+'">'+erpProfitabilitySourceLabel(row.source)+'</span></td><td><strong>'+erpEscape(row.itemName)+'</strong></td><td>'+erpEscape(row.customerName)+'</td><td>'+erpEscape(row.salesperson)+'</td><td>'+erpMoney(row.quantity)+'</td><td>'+(row.revenueKnown?"NT$ "+erpMoney(row.revenue):"—")+'</td><td>'+(row.costKnown?"NT$ "+erpMoney(row.cost):"—")+'</td><td>'+(complete?"NT$ "+erpMoney(row.grossProfit):"—")+'</td><td>'+erpProfitabilityCompleteness({missingRevenue:row.revenueKnown?0:1,missingCost:row.costKnown?0:1})+'</td></tr>';
      }).join("")
      +'</tbody></table></div>':'<div class="erp-empty">此條件下尚無實際銷貨異動。</div>')
    +'</section>';
}
function renderErpProfitability(){
  const el=document.getElementById("erp-page-profitability");
  if(!el) return;
  const data=erpProfitabilityBuild();
  const rows=data.sales.filter(erpProfitabilityInRange);
  const summary=erpProfitabilitySummary(rows);
  const customerGroups=erpProfitabilityGroup(rows,"customerName","未填客戶");
  const itemGroups=erpProfitabilityGroup(rows,"itemName","未命名品項");
  const salespersonGroups=erpProfitabilityGroup(rows,"salesperson","未填業務");
  const profitRate=summary.completeRevenue>0?Math.round(summary.grossProfit/summary.completeRevenue*1000)/10:null;
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">COST & PROFITABILITY</p><h1>成本與毛利</h1><p>以實際庫存進貨的進價計算移動平均成本；銷貨毛利以未稅金額計算，不會改動庫存或帳務。</p></div></div>'
    +'<section class="erp-panel"><form id="erpProfitabilityFilter" class="erp-invoice-filters"><label>起始日期<input name="from" type="date" value="'+erpEscape(erpProfitabilityFilter.from)+'"></label><label>結束日期<input name="to" type="date" value="'+erpEscape(erpProfitabilityFilter.to)+'"></label><label>商品來源<select name="source"><option value="all"'+(erpProfitabilityFilter.source==="all"?" selected":"")+'>全部</option><option value="tire"'+(erpProfitabilityFilter.source==="tire"?" selected":"")+'>輪胎</option><option value="kyb"'+(erpProfitabilityFilter.source==="kyb"?" selected":"")+'>KYB</option></select></label><button class="erp-primary">套用篩選</button><button type="button" class="erp-secondary" id="erpProfitabilityClear">清除篩選</button></form></section>'
    +'<div class="erp-metric-grid"><article class="erp-metric"><span>未稅銷貨額</span><strong>NT$ '+erpMoney(summary.revenue)+'</strong><small>'+summary.salesCount+' 筆實際銷貨</small></article><article class="erp-metric"><span>已知銷貨成本</span><strong>NT$ '+erpMoney(summary.cost)+'</strong><small>依移動平均成本計算</small></article><article class="erp-metric"><span>已知毛利</span><strong>NT$ '+erpMoney(summary.grossProfit)+'</strong><small>'+(profitRate==null?"尚無完整成本":"毛利率 "+profitRate+"%")+'</small></article><article class="erp-metric"><span>成本待補</span><strong>'+summary.missingCost+' 筆</strong><small>補登進貨單位成本後可重算</small></article></div>'
    +'<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">REPORT STATUS</p><h2>計算說明</h2></div></div><div class="erp-form-hint">「已知毛利」只統計售價與成本都齊全的銷貨。舊進貨若沒有填進價，或舊退貨沒有原始成本，會標示為待補，避免把毛利誤算得過高。</div></section>'
    +erpProfitabilityGroupTable("依客戶分析",customerGroups)
    +erpProfitabilityGroupTable("依品項分析",itemGroups)
    +erpProfitabilityGroupTable("依業務分析",salespersonGroups)
    +erpProfitabilityInventoryTable(data.states)
    +erpProfitabilitySalesTable(rows);
  const filter=document.getElementById("erpProfitabilityFilter");
  filter.addEventListener("submit",event=>{
    event.preventDefault();
    erpProfitabilityFilter={from:filter.elements.from.value,to:filter.elements.to.value,source:filter.elements.source.value};
    renderErpProfitability();
  });
  document.getElementById("erpProfitabilityClear").addEventListener("click",()=>{
    erpProfitabilityFilter={from:"",to:"",source:"all"};
    renderErpProfitability();
  });
}
