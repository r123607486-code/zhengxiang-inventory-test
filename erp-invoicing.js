// ERP 月結開票：發票、通用應收帳與客戶對帳單刻意分離。
// 發票建立時才產生應收帳；收款與沖帳由 erp-settlements.js 處理。

function erpDefaultInvoiceRange(){
  const now=new Date(),first=new Date(now.getFullYear(),now.getMonth(),1);
  return {from:first.toISOString().slice(0,10),to:todayStr()};
}
function erpInvoiceCandidates(){
  return erpSalesOrdersCache.filter(order=>order.status==="confirmed"&&!order.invoiceId);
}
function erpInvoiceTotal(orders){
  return orders.reduce((sum,order)=>{
    const total=erpDisplayTotals(order);
    sum.subtotal+=total.subtotal;
    sum.taxAmount+=total.taxAmount;
    sum.totalAmount+=total.totalAmount;
    return sum;
  },{subtotal:0,taxAmount:0,totalAmount:0});
}
function erpInvoiceLinesForOrder(order){
  const lines=erpOrderLines(order);
  const total=erpDisplayTotals(order);
  const rawTotal=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0)*(Number(line.unitPrice)||0),0);
  let allocated=0;
  return lines.map((line,index)=>{
    const raw=(Number(line.quantity)||0)*(Number(line.unitPrice)||0);
    let subtotalAmount;
    if(index===lines.length-1) subtotalAmount=total.subtotal-allocated;
    else{
      subtotalAmount=rawTotal>0?Math.round(total.subtotal*(raw/rawTotal)):0;
      allocated+=subtotalAmount;
    }
    return {saleOrderId:order.id,orderNo:order.orderNo,orderDate:order.orderDate,itemName:line.itemName,quantity:Number(line.quantity)||0,unitPrice:Number(line.unitPrice)||0,subtotalAmount};
  });
}
function renderErpInvoices(){
  const el=document.getElementById("erp-page-invoices");
  if(!el) return;
  const range=erpDefaultInvoiceRange();
  if(!erpInvoiceFilter.from) erpInvoiceFilter.from=range.from;
  if(!erpInvoiceFilter.to) erpInvoiceFilter.to=range.to;
  const candidates=erpInvoiceCandidates();
  const customerNames=[...new Set(candidates.map(order=>order.customerName||"未指定客戶"))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  const filtered=candidates.filter(order=>
    (!erpInvoiceFilter.customerName||(order.customerName||"未指定客戶")===erpInvoiceFilter.customerName) &&
    (!erpInvoiceFilter.from||order.orderDate>=erpInvoiceFilter.from) &&
    (!erpInvoiceFilter.to||order.orderDate<=erpInvoiceFilter.to)
  );
  const activeSeries=erpActiveInvoiceSeries();
  if(!erpInvoiceFilter.seriesId&&activeSeries.length===1) erpInvoiceFilter.seriesId=activeSeries[0].id;
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">MONTHLY INVOICING</p><h1>發票管理</h1><p>月結發票只負責開立與字軌；開立成功後才自動建立一筆應收帳，對帳單則在另一個頁面產生。</p></div></div>'
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">INVOICE SERIES</p><h2>發票字軌</h2></div><button class="erp-secondary" id="erpInvoiceSeriesBtn">管理字軌</button></div>'
    + '<div class="erp-invoice-filters"><label>本次字軌<select id="erpInvoiceSeries">'+erpInvoiceSeriesOptions(erpInvoiceFilter.seriesId)+'</select></label><span class="erp-form-hint">'+(activeSeries.length?"請選擇實際取得且尚未用完的字軌。":"請先建立發票字軌，才可開立月結發票。")+'</span></div></section>'
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">SELECT SALES DOCUMENTS</p><h2>選取本期銷貨單</h2></div><span class="erp-counter">'+filtered.length+' 筆可開票</span></div>'
    + '<div class="erp-invoice-filters"><label>客戶<select id="erpInvoiceCustomer"><option value="">請選擇客戶</option>'+customerNames.map(name=>'<option value="'+erpEscape(name)+'"'+(erpInvoiceFilter.customerName===name?" selected":"")+">"+erpEscape(name)+"</option>").join("")+'</select></label><label>銷貨日期起<input type="date" id="erpInvoiceFrom" value="'+erpEscape(erpInvoiceFilter.from)+'"></label><label>銷貨日期迄<input type="date" id="erpInvoiceTo" value="'+erpEscape(erpInvoiceFilter.to)+'"></label><button class="erp-secondary" id="erpInvoiceFilterBtn">套用篩選</button></div>'
    + (erpInvoiceFilter.customerName&&filtered.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th><input type="checkbox" id="erpInvoiceSelectAll"></th><th>銷貨日期</th><th>銷貨單號</th><th>品項</th><th>未稅</th><th>稅額</th><th>總計</th><th>稅別</th></tr></thead><tbody>'
      + filtered.map(order=>{const total=erpDisplayTotals(order);return '<tr><td><input type="checkbox" data-invoice-sale="'+erpEscape(order.id)+'"></td><td>'+erpEscape(order.orderDate||"-")+'</td><td><strong>'+erpEscape(order.orderNo)+'</strong></td><td>'+erpEscape(order.itemName)+' × '+(Number(order.quantity)||0)+'</td><td>NT$ '+erpMoney(total.subtotal)+'</td><td>NT$ '+erpMoney(total.taxAmount)+'</td><td>NT$ '+erpMoney(total.totalAmount)+'</td><td>'+erpTaxLabel(order.taxMode)+'</td></tr>';}).join("")
      + '</tbody></table></div><div class="erp-invoice-total" id="erpInvoiceTotal"><span>請勾選銷貨單以計算本次月結金額。</span></div><div class="erp-form-actions"><button class="erp-primary" id="erpCreateInvoiceBtn">建立月結發票與應收帳</button></div>'
      :(erpInvoiceFilter.customerName?'<div class="erp-empty">此客戶在選定期間沒有尚未開票的已確認銷貨單。</div>':'<div class="erp-empty"><strong>請先選擇客戶。</strong><br>系統只會將同一個客戶的銷貨單合併開票，避免帳務混在一起。</div>'))
    + '</section>'
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">INVOICE HISTORY</p><h2>已建立的月結發票</h2></div><span class="erp-counter">'+erpInvoicesCache.length+' 筆</span></div>'
    + (erpInvoicesCache.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>發票編號</th><th>客戶</th><th>開票日期</th><th>銷貨單數</th><th>未稅</th><th>稅額</th><th>總計</th><th>狀態</th><th></th></tr></thead><tbody>'
      +erpInvoicesCache.map(invoice=>'<tr><td><strong>'+erpEscape(invoice.invoiceNo)+'</strong></td><td>'+erpEscape(invoice.customerName)+'</td><td>'+erpEscape(invoice.invoiceDate||"-")+'</td><td>'+((invoice.saleOrderIds||[]).length)+' 筆</td><td>NT$ '+erpMoney(invoice.subtotalAmount)+'</td><td>NT$ '+erpMoney(invoice.taxAmount)+'</td><td><strong>NT$ '+erpMoney(invoice.totalAmount)+'</strong></td><td>'+erpEscape(invoice.status==="void"?"已作廢":"已開立")+'</td><td><button class="erp-print-btn" data-erp-print-invoice="'+erpEscape(invoice.id)+'">預覽列印</button>'+(invoice.status!=="void"?'<button class="erp-edit-btn" data-invoice-void="'+erpEscape(invoice.id)+'">作廢</button>':'')+'</td></tr>').join("")
      +'</tbody></table></div>':'<div class="erp-empty">尚未建立月結發票。</div>')
    + '</section>';
  document.getElementById("erpInvoiceSeriesBtn").addEventListener("click",openErpInvoiceSeriesManager);
  document.getElementById("erpInvoiceFilterBtn").addEventListener("click",()=>{
    erpInvoiceFilter={
      customerName:document.getElementById("erpInvoiceCustomer").value,
      from:document.getElementById("erpInvoiceFrom").value,
      to:document.getElementById("erpInvoiceTo").value,
      seriesId:document.getElementById("erpInvoiceSeries").value
    };
    renderErpInvoices();
  });
  const boxes=[...el.querySelectorAll("[data-invoice-sale]")];
  const updateTotal=()=>{
    const selected=boxes.filter(box=>box.checked).map(box=>erpSalesOrdersCache.find(order=>order.id===box.dataset.invoiceSale)).filter(Boolean);
    const total=erpInvoiceTotal(selected),target=document.getElementById("erpInvoiceTotal");
    if(target) target.innerHTML='<div><span>本次合併銷貨單</span><strong>'+selected.length+' 筆</strong></div><div><span>未稅金額</span><strong>NT$ '+erpMoney(total.subtotal)+'</strong></div><div><span>營業稅 5%</span><strong>NT$ '+erpMoney(total.taxAmount)+'</strong></div><div class="erp-grand-total"><span>含稅總計</span><strong>NT$ '+erpMoney(total.totalAmount)+'</strong></div>';
  };
  const selectAll=document.getElementById("erpInvoiceSelectAll");
  if(selectAll) selectAll.addEventListener("change",()=>{boxes.forEach(box=>box.checked=selectAll.checked);updateTotal();});
  boxes.forEach(box=>box.addEventListener("change",updateTotal));
  const create=document.getElementById("erpCreateInvoiceBtn");
  if(create) create.addEventListener("click",createErpInvoice);
  el.querySelectorAll("[data-erp-print-invoice]").forEach(button=>button.addEventListener("click",()=>{const invoice=erpInvoicesCache.find(item=>item.id===button.dataset.erpPrintInvoice);if(invoice)openErpPrintPreview(null,invoice);}));
  el.querySelectorAll("[data-invoice-void]").forEach(button=>button.addEventListener("click",()=>voidErpInvoice(button.dataset.invoiceVoid)));
}
async function createErpInvoice(){
  const selected=[...document.querySelectorAll("[data-invoice-sale]:checked")].map(box=>erpSalesOrdersCache.find(order=>order.id===box.dataset.invoiceSale)).filter(Boolean);
  const customerName=erpInvoiceFilter.customerName;
  const seriesId=document.getElementById("erpInvoiceSeries")?document.getElementById("erpInvoiceSeries").value:erpInvoiceFilter.seriesId;
  if(!selected.length) return alert("請至少選擇一筆銷貨單。");
  if(!seriesId) return alert("請先選擇發票字軌；尚未設定字軌時，請按「管理字軌」新增。");
  if(!customerName||selected.some(order=>(order.customerName||"未指定客戶")!==customerName||order.status!=="confirmed"||order.invoiceId)) return alert("選取內容已變更，請重新整理後再試。");
  const taxModes=new Set(selected.map(order=>order.taxMode||"no_tax"));
  if(taxModes.size>1) return alert("選取的銷貨單稅別不一致，月結發票只能合併稅別相同的銷貨單。");
  const total=erpInvoiceTotal(selected);
  if(!confirm("建立月結發票與應收帳？含稅總計 NT$ "+erpMoney(total.totalAmount)+"。")) return;
  const customer=erpPartiesCache.find(item=>(item.name||"")===customerName);
  const invoiceRef=db.collection("erpInvoices").doc();
  try{
    await db.runTransaction(async tx=>{
      const freshOrders=[];
      for(const item of selected){
        const ref=db.collection("erpSalesOrders").doc(item.id);
        const snap=await tx.get(ref);
        if(!snap.exists||snap.data().status!=="confirmed"||snap.data().invoiceId) throw new Error("其中一筆銷貨單狀態已變更，請重新整理後再試。");
        freshOrders.push({id:item.id,...snap.data()});
      }
      const freshTaxModes=new Set(freshOrders.map(item=>item.taxMode||"no_tax"));
      if(freshTaxModes.size>1) throw new Error("來源銷貨單的稅別已變更，無法合併開票。");
      const freshTotal=erpInvoiceTotal(freshOrders);
      const series=await erpReserveInvoiceNumber(tx,seriesId);
      const lines=freshOrders.flatMap(erpInvoiceLinesForOrder);
      const invoice={
        invoiceNo:series.invoiceNo,
        invoiceDate:todayStr(),
        invoiceKind:"monthly",
        invoiceSeriesId:series.seriesId,
        invoiceSeriesCode:series.seriesCode,
        invoiceSequenceNo:series.sequenceNo,
        invoicePeriodLabel:series.periodLabel,
        customerId:customer?customer.id:null,
        customerName,
        periodFrom:erpInvoiceFilter.from,
        periodTo:erpInvoiceFilter.to,
        saleOrderIds:freshOrders.map(item=>item.id),
        lines,
        subtotalAmount:freshTotal.subtotal,
        taxAmount:freshTotal.taxAmount,
        totalAmount:freshTotal.totalAmount,
        taxMode:[...freshTaxModes][0],
        taxRate:[...freshTaxModes][0]==="no_tax"?0:.05,
        status:"issued",
        createdAt:firebase.firestore.FieldValue.serverTimestamp(),
        createdByUid:currentUser.uid,
        createdByName:currentUser.name
      };
      const ledgerRef=erpAccountingCreateReceivableLedger(tx,invoiceRef,invoice,customer);
      tx.set(invoiceRef,{...invoice,ledgerId:ledgerRef.id});
      freshOrders.forEach(item=>tx.update(db.collection("erpSalesOrders").doc(item.id),{invoiceId:invoiceRef.id,invoiceNo:invoice.invoiceNo,invoicedAt:firebase.firestore.FieldValue.serverTimestamp()}));
    });
    erpAccountingAudit("invoice_issued",invoiceRef.id,{customerName,seriesId,totalAmount:total.totalAmount});
    alert("月結發票與應收帳已建立。請到「帳務與收款」登錄後續收款。");
  }catch(error){
    console.error(error);
    alert("建立失敗："+(error.message||"請確認 Firebase Rules 權限。"));
  }
}
async function voidErpInvoice(id){
  const invoice=erpInvoicesCache.find(item=>item.id===id);
  if(!invoice||invoice.status==="void") return;
  if(!confirm("作廢此月結發票？來源銷貨單會恢復為未月結，但已使用的發票號碼不會回收。")) return;
  try{
    if(!invoice.ledgerId){
      const legacy=erpReceivablesCache.find(item=>item.invoiceId===id);
      if(legacy&&(Number(legacy.receivedAmount)||0)>0) return alert("此舊版月結已有收款，請先作廢相關收款後才能作廢月結。");
      const batch=db.batch();
      batch.update(db.collection("erpInvoices").doc(id),{status:"void",voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
      if(legacy) batch.update(db.collection("erpReceivables").doc(legacy.id),{status:"void",balanceAmount:0,voidedAt:firebase.firestore.FieldValue.serverTimestamp()});
      (invoice.saleOrderIds||[]).forEach(orderId=>batch.update(db.collection("erpSalesOrders").doc(orderId),{invoiceId:firebase.firestore.FieldValue.delete(),invoiceNo:firebase.firestore.FieldValue.delete(),invoicedAt:firebase.firestore.FieldValue.delete()}));
      await batch.commit();
    }else{
      await db.runTransaction(async tx=>{
        const ledgerRef=db.collection(ERP_ACCOUNTING.ledger).doc(invoice.ledgerId);
        const ledgerSnap=await tx.get(ledgerRef);
        if(!ledgerSnap.exists) throw new Error("找不到這張發票的應收帳。");
        const ledger=ledgerSnap.data();
        if(erpAccountingNumber(ledger.settledAmount)>0) throw new Error("此發票已有收款沖帳，請先作廢相關收款後才能作廢。");
        tx.update(db.collection("erpInvoices").doc(id),{status:"void",voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
        tx.update(ledgerRef,{status:"void",balanceAmount:0,voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
        (invoice.saleOrderIds||[]).forEach(orderId=>tx.update(db.collection("erpSalesOrders").doc(orderId),{invoiceId:firebase.firestore.FieldValue.delete(),invoiceNo:firebase.firestore.FieldValue.delete(),invoicedAt:firebase.firestore.FieldValue.delete()}));
      });
    }
    erpAccountingAudit("invoice_voided",id,{invoiceNo:invoice.invoiceNo});
  }catch(error){
    console.error(error);
    alert("作廢失敗："+(error.message||""));
  }
}
