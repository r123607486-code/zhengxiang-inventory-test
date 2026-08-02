// ERP 銷貨退回與折讓。
// 實體退貨：回補輪胎／KYB 庫存並建立 sales_return 異動。
// 純折讓：只沖回應收帳，不改動庫存。兩者皆保留作廢歷程。

function erpReturnInvoiceById(id){
  return erpInvoicesCache.find(invoice=>invoice.id===id);
}
function erpReturnInvoiceLines(invoice){
  return Array.isArray(invoice&&invoice.lines)?invoice.lines:[];
}
function erpReturnConfirmedQty(invoiceId,lineIndex){
  return erpSalesReturnsCache
    .filter(item=>item.invoiceId===invoiceId&&item.status==="confirmed")
    .reduce((sum,item)=>sum+(item.lines||[]).filter(line=>Number(line.lineIndex)===Number(lineIndex)).reduce((lineSum,line)=>lineSum+(Number(line.quantity)||0),0),0);
}
function erpReturnItem(source,itemId){
  return (source==="tire"?erpTireItemsCache:erpKybItemsCache).find(item=>item.id===itemId);
}
function erpReturnLocationOptions(source,item){
  const itemCodes=Object.keys((item&&item.locations)||{});
  const master=source==="tire"
    ? (typeof locationsCache!=="undefined"?locationsCache:[])
    : (typeof kybLocationsCache!=="undefined"?kybLocationsCache:[]);
  const masterCodes=master.map(location=>location.code).filter(Boolean);
  return [...new Set(itemCodes.concat(masterCodes))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
}
function erpReturnLineInfo(invoice,line,index){
  const source=line.itemSource||invoice.sourceType||"custom";
  const itemId=line.itemId||"";
  const sold=Math.max(0,Number(line.quantity)||0);
  const returned=erpReturnConfirmedQty(invoice.id,index);
  return {
    lineIndex:index,source,itemId,itemName:line.itemName||"",
    unitPrice:Math.max(0,Number(line.unitPrice)||0),
    soldQty:sold,returnedQty:returned,availableQty:Math.max(0,sold-returned),
    stockEligible:(source==="tire"||source==="kyb")&&!!itemId
  };
}
function erpReturnTotals(invoice,lines){
  const lineAmount=lines.reduce((sum,line)=>sum+(Number(line.quantity)||0)*(Number(line.unitPrice)||0),0);
  return salesPricingTotals({lineAmount,taxMode:invoice.taxMode||"no_tax"});
}
function erpReturnManualTotals(invoice,amount){
  const totalAmount=Math.round(Math.max(0,Number(amount)||0));
  if(!totalAmount) throw new Error("請輸入大於 0 的折讓含稅總額。");
  const taxMode=invoice.taxMode||"no_tax";
  if(taxMode==="tax_excluded"){
    const taxAmount=Math.round(totalAmount*SALES_TAX_RATE/(1+SALES_TAX_RATE));
    const subtotal=totalAmount-taxAmount;
    return {lineAmount:subtotal,subtotal,taxAmount,totalAmount,taxRate:SALES_TAX_RATE,taxMode};
  }
  return salesPricingTotals({lineAmount:totalAmount,taxMode});
}
function erpReturnNo(){
  const d=new Date(),two=n=>String(n).padStart(2,"0");
  return "SR-"+d.getFullYear()+two(d.getMonth()+1)+two(d.getDate())+"-"+two(d.getHours())+two(d.getMinutes())+two(d.getSeconds())+"-"+String(d.getMilliseconds()).padStart(3,"0");
}
function erpReturnTypeLabel(type){
  return type==="stock_return"?"退貨入庫":"帳務折讓";
}
function erpReturnTxnTypeLabel(type){
  return type==="sales_return"?"銷貨退回入庫":type==="sales_return_void"?"銷貨退回作廢出庫":"";
}
function erpReturnBuildFormLines(invoice,type){
  return erpReturnInvoiceLines(invoice).map((line,index)=>{
    const info=erpReturnLineInfo(invoice,line,index);
    const item=info.stockEligible?erpReturnItem(info.source,info.itemId):null;
    const locations=info.stockEligible?erpReturnLocationOptions(info.source,item):[];
    const defaultLocation=locations[0]||"";
    return '<div class="erp-return-line" data-return-line="'+index+'">'
      + '<div><strong>'+erpEscape(info.itemName||"未命名品項")+'</strong><small>'+erpEscape(info.source==="tire"?"輪胎":info.source==="kyb"?"KYB":"其他")+'｜原銷 '+info.soldQty+'｜已退 '+info.returnedQty+'｜可退 '+info.availableQty+'</small></div>'
      + '<label>退回數量<input class="erp-return-qty" type="number" min="0" max="'+info.availableQty+'" value="0" data-line-index="'+index+'"></label>'
      + '<input type="hidden" class="erp-return-source" value="'+erpEscape(info.source)+'"><input type="hidden" class="erp-return-item" value="'+erpEscape(info.itemId)+'">'
      + '<input type="hidden" class="erp-return-price" value="'+info.unitPrice+'"><input type="hidden" class="erp-return-name" value="'+erpEscape(info.itemName||"")+'">'
      + (info.stockEligible?'<label class="erp-return-stock-field">回補儲位<select class="erp-return-loc"><option value="">請選擇儲位</option>'+locations.map(code=>'<option value="'+erpEscape(code)+'"'+(code===defaultLocation?" selected":"")+">"+erpEscape(code)+"</option>").join("")+'</select></label>'
        +(info.source==="tire"?'<label class="erp-return-stock-field">生產批次<input class="erp-return-batch" type="date"></label>':'')
        :'<span class="erp-form-hint">此明細缺少庫存品項 ID，只可做帳務折讓。</span>')
      + '</div>';
  }).join("");
}
function erpReturnCollectLines(invoice,form,type){
  const result=[];
  form.querySelectorAll("[data-return-line]").forEach(node=>{
    const quantity=Math.max(0,Number(node.querySelector(".erp-return-qty").value)||0);
    if(!quantity) return;
    const lineIndex=Number(node.dataset.returnLine);
    const info=erpReturnLineInfo(invoice,erpReturnInvoiceLines(invoice)[lineIndex],lineIndex);
    if(quantity>info.availableQty) throw new Error("「"+info.itemName+"」超過可退數量，請重新整理後再試。");
    const source=node.querySelector(".erp-return-source").value;
    const itemId=node.querySelector(".erp-return-item").value;
    const locNode=node.querySelector(".erp-return-loc");
    const batchNode=node.querySelector(".erp-return-batch");
    if(type==="stock_return"){
      if(!info.stockEligible) throw new Error("「"+info.itemName+"」沒有庫存品項資訊，只能做帳務折讓。");
      if(!locNode||!locNode.value) throw new Error("請選擇「"+info.itemName+"」的回補儲位。");
    }
    result.push({
      lineIndex,source,itemId,itemName:node.querySelector(".erp-return-name").value,
      quantity,unitPrice:Number(node.querySelector(".erp-return-price").value)||0,
      loc:locNode?locNode.value:"",
      batchDate:batchNode?batchNode.value||null:null
    });
  });
  if(!result.length) throw new Error("請至少輸入一個退回品項與數量。");
  return result;
}
function erpReturnApplyTire(item,line,reverse){
  const all={...(item.locations||{})};
  const batches=normalizeBatches(all[line.loc],item).map(batch=>({...batch}));
  let index=batches.findIndex(batch=>(batch.productionDate||null)===(line.batchDate||null));
  if(index<0){
    if(reverse) throw new Error("回補儲位／批次已不存在，無法作廢退貨。");
    batches.push({qty:0,productionDate:line.batchDate||null});
    index=batches.length-1;
  }
  const next=(Number(batches[index].qty)||0)+(reverse?-Number(line.quantity):Number(line.quantity));
  if(next<0) throw new Error("回補庫存已不足，無法作廢退貨；請先確認這些商品是否已再次出貨。");
  batches[index].qty=next;
  const kept=batches.filter(batch=>(Number(batch.qty)||0)>0);
  if(kept.length) all[line.loc]=kept; else delete all[line.loc];
  return all;
}
function erpReturnApplyKyb(item,line,reverse){
  const all={...(item.locations||{})};
  const current=kybLocQty(all[line.loc]);
  const next=current+(reverse?-Number(line.quantity):Number(line.quantity));
  if(next<0) throw new Error("回補庫存已不足，無法作廢退貨；請先確認這些商品是否已再次出貨。");
  if(next>0) all[line.loc]=next; else delete all[line.loc];
  return all;
}
function erpReturnStockCollection(source){
  return source==="tire"?"items":"kybItems";
}
function erpReturnTransactionCollection(source){
  return source==="tire"?"transactions":"kybTransactions";
}
async function createErpSalesReturn(invoice,form){
  const type=form.elements.returnType.value;
  if(type==="stock_return"&&!userHasAnyRole("admin")) return alert("實體退貨會回補庫存，目前只允許管理者確認。請改由管理者帳號操作。");
  if(!invoice.ledgerId) return alert("這是舊版發票，尚未有新通用應收帳；目前只支援新版月結發票建立退回／折讓。");
  let inputLines=[],preview;
  try{
    if(type==="allowance") preview=erpReturnManualTotals(invoice,form.elements.manualAmount.value);
    else{
      inputLines=erpReturnCollectLines(invoice,form,type);
      preview=erpReturnTotals(invoice,inputLines);
    }
  }catch(error){return alert(error.message||"退回明細不正確。");}
  if(!confirm("確認建立「"+erpReturnTypeLabel(type)+"」？本次將沖回 NT$ "+erpMoney(preview.totalAmount)+(type==="stock_return"?"，並回補指定儲位庫存。":"，不會異動庫存。"))) return;
  const returnRef=db.collection("erpSalesReturns").doc();
  const settlementRef=db.collection(ERP_ACCOUNTING.settlements).doc();
  const invoiceRef=db.collection("erpInvoices").doc(invoice.id);
  try{
    await db.runTransaction(async tx=>{
      const invoiceSnap=await tx.get(invoiceRef);
      if(!invoiceSnap.exists||invoiceSnap.data().status!=="issued") throw new Error("發票狀態已變更，請重新整理後再試。");
      const liveInvoice=invoiceSnap.data();
      if(!liveInvoice.ledgerId) throw new Error("發票沒有對應的新應收帳。");
      const ledgerRef=db.collection(ERP_ACCOUNTING.ledger).doc(liveInvoice.ledgerId);
      const ledgerSnap=await tx.get(ledgerRef);
      if(!ledgerSnap.exists||ledgerSnap.data().status==="void") throw new Error("找不到有效應收帳。");
      const returned={...(liveInvoice.returnedQuantities||{})};
      const liveLines=Array.isArray(liveInvoice.lines)?liveInvoice.lines:[];
      const lines=type==="stock_return"?inputLines.map(input=>{
        const original=liveLines[input.lineIndex];
        if(!original) throw new Error("發票明細已變更，請重新整理後再試。");
        const sold=Math.max(0,Number(original.quantity)||0);
        const used=Math.max(0,Number(returned[String(input.lineIndex)])||0);
        if(input.quantity>sold-used) throw new Error("「"+(original.itemName||"品項")+"」已被其他退回單使用，請重新整理後再試。");
        returned[String(input.lineIndex)]=used+input.quantity;
        return {...input,itemName:original.itemName||input.itemName,unitPrice:Number(original.unitPrice)||0};
      }):[];
      const totals=type==="allowance"
        ? erpReturnManualTotals(liveInvoice,preview.totalAmount)
        : erpReturnTotals(liveInvoice,lines);
      const ledger=ledgerSnap.data();
      if(totals.totalAmount>erpAccountingNumber(ledger.balanceAmount)) throw new Error("退回／折讓金額超過目前未收餘額。若此發票已收款，請先處理退款或作廢收款。");
      const itemSnapshots=new Map();
      if(type==="stock_return"){
        for(const line of lines){
          const key=line.source+":"+line.itemId;
          if(!itemSnapshots.has(key)){
            const ref=db.collection(erpReturnStockCollection(line.source)).doc(line.itemId);
            const snap=await tx.get(ref);
            if(!snap.exists) throw new Error("找不到「"+line.itemName+"」的庫存主檔。");
            itemSnapshots.set(key,{ref,item:snap.data()});
          }
        }
      }
      const stockTransactionIds=[];
      if(type==="stock_return"){
        for(const line of lines){
          const state=itemSnapshots.get(line.source+":"+line.itemId);
          const locations=line.source==="tire"?erpReturnApplyTire(state.item,line,false):erpReturnApplyKyb(state.item,line,false);
          state.item={...state.item,locations};
          const txnRef=db.collection(erpReturnTransactionCollection(line.source)).doc();
          stockTransactionIds.push(txnRef.id);
          tx.set(txnRef,{itemId:line.itemId,type:"sales_return",qty:line.quantity,loc:line.loc,batchDate:line.source==="tire"?line.batchDate||null:null,date:todayStr(),operator:currentUser.name,salesperson:liveInvoice.createdByName||"",customerName:liveInvoice.customerName||"",customerContact:"",customerNote:(form.elements.reason.value||"").trim(),returnId:returnRef.id,invoiceId:invoiceRef.id,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        }
        itemSnapshots.forEach(state=>tx.update(state.ref,{locations:state.item.locations}));
      }
      const nextSettled=erpAccountingNumber(ledger.settledAmount)+totals.totalAmount;
      tx.set(settlementRef,{settlementNo:"CR-"+erpReturnNo().slice(3),settlementType:"return_credit",direction:"credit",settlementDate:form.elements.returnDate.value,amount:totals.totalAmount,method:type==="stock_return"?"退貨折抵":"帳務折讓",referenceNo:liveInvoice.invoiceNo||"",notes:(form.elements.reason.value||"").trim(),partyId:ledger.partyId||null,partyName:ledger.partyName||liveInvoice.customerName||"",allocations:[{ledgerId:ledgerRef.id,amount:totals.totalAmount}],status:"active",returnId:returnRef.id,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
      tx.update(ledgerRef,{settledAmount:nextSettled,balanceAmount:erpAccountingBalance(ledger.originalAmount,nextSettled),status:erpAccountingStatus(ledger.originalAmount,nextSettled,false),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name});
      tx.update(invoiceRef,{returnedQuantities:returned,returnedAmount:erpAccountingNumber(liveInvoice.returnedAmount)+totals.totalAmount,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      tx.set(returnRef,{returnNo:erpReturnNo(),invoiceId:invoiceRef.id,invoiceNo:liveInvoice.invoiceNo||"",ledgerId:ledgerRef.id,settlementId:settlementRef.id,customerId:liveInvoice.customerId||null,customerName:liveInvoice.customerName||"",returnType:type,returnDate:form.elements.returnDate.value,reason:(form.elements.reason.value||"").trim(),manualAmount:type==="allowance"?totals.totalAmount:null,lines,subtotalAmount:totals.subtotal,taxAmount:totals.taxAmount,totalAmount:totals.totalAmount,taxMode:liveInvoice.taxMode||"no_tax",status:"confirmed",stockTransactionIds,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
    });
    erpAccountingAudit("sales_return_created",returnRef.id,{invoiceId:invoice.id,returnType:type,totalAmount:preview.totalAmount});
    erpReturnFilter={invoiceId:""};
    alert("已建立"+erpReturnTypeLabel(type)+"。");
  }catch(error){
    console.error(error);
    alert("建立失敗："+(error.message||"請確認 Firebase Rules 權限。"));
  }
}
async function voidErpSalesReturn(id){
  const shown=erpSalesReturnsCache.find(item=>item.id===id);
  if(!shown||shown.status!=="confirmed") return;
  if(shown.returnType==="stock_return"&&!userHasAnyRole("admin")) return alert("實體退貨作廢會扣回庫存，目前只允許管理者操作。");
  if(!confirm("作廢這張退回／折讓單？帳務會回補；實體退貨也會扣回原本回補的庫存。")) return;
  const returnRef=db.collection("erpSalesReturns").doc(id);
  try{
    await db.runTransaction(async tx=>{
      const returnSnap=await tx.get(returnRef);
      if(!returnSnap.exists||returnSnap.data().status!=="confirmed") throw new Error("退回單狀態已變更，請重新整理後再試。");
      const live=returnSnap.data();
      const invoiceRef=db.collection("erpInvoices").doc(live.invoiceId);
      const ledgerRef=db.collection(ERP_ACCOUNTING.ledger).doc(live.ledgerId);
      const settlementRef=db.collection(ERP_ACCOUNTING.settlements).doc(live.settlementId);
      const invoiceSnap=await tx.get(invoiceRef);
      const ledgerSnap=await tx.get(ledgerRef);
      const settlementSnap=await tx.get(settlementRef);
      if(!invoiceSnap.exists||!ledgerSnap.exists||!settlementSnap.exists) throw new Error("找不到對應發票、帳務或沖帳資料。");
      if(settlementSnap.data().status==="void") throw new Error("這筆折抵已被作廢，不能再次作廢退回單。");
      const itemStates=new Map(), reservationBalances=new Map();
      if(live.returnType==="stock_return"){
        for(const line of live.lines||[]){
          const key=line.source+":"+line.itemId;
          if(!itemStates.has(key)){
            const itemRef=db.collection(erpReturnStockCollection(line.source)).doc(line.itemId);
            const itemSnap=await tx.get(itemRef);
            if(!itemSnap.exists) throw new Error("找不到回補庫存主檔。");
            itemStates.set(key,{itemRef,item:itemSnap.data()});
          }
          const balanceKey=line.source+":"+line.itemId+":"+line.loc+":"+(line.source==="tire"?(line.batchDate||""):"");
          if(!reservationBalances.has(balanceKey)){
            const balanceRef=reservationBalanceRef(line.source,line.itemId,line.loc,line.source==="tire"?line.batchDate||null:null);
            const balanceSnap=await tx.get(balanceRef);
            reservationBalances.set(balanceKey,reservationBalanceQty(balanceSnap));
          }
        }
      }
      const invoice=invoiceSnap.data(),ledger=ledgerSnap.data(),amount=erpAccountingNumber(live.totalAmount);
      const nextReturned={...(invoice.returnedQuantities||{})};
      for(const line of live.lines||[]){
        nextReturned[String(line.lineIndex)]=Math.max(0,erpAccountingNumber(nextReturned[String(line.lineIndex)])-erpAccountingNumber(line.quantity));
        if(live.returnType==="stock_return"){
          const state=itemStates.get(line.source+":"+line.itemId);
          const existing=line.source==="tire"
            ? normalizeBatches((state.item.locations||{})[line.loc],state.item).find(batch=>(batch.productionDate||null)===(line.batchDate||null))
            : {qty:kybLocQty((state.item.locations||{})[line.loc])};
          const balanceKey=line.source+":"+line.itemId+":"+line.loc+":"+(line.source==="tire"?(line.batchDate||""):"");
          if((Number(existing&&existing.qty)||0)-Number(line.quantity)<(reservationBalances.get(balanceKey)||0)) throw new Error("回補庫存已有有效預留，無法作廢退貨。");
          const locations=line.source==="tire"?erpReturnApplyTire(state.item,line,true):erpReturnApplyKyb(state.item,line,true);
          state.item={...state.item,locations};
          const txnRef=db.collection(erpReturnTransactionCollection(line.source)).doc();
          tx.set(txnRef,{itemId:line.itemId,type:"sales_return_void",qty:line.quantity,loc:line.loc,batchDate:line.source==="tire"?line.batchDate||null:null,date:todayStr(),operator:currentUser.name,salesperson:"",customerName:invoice.customerName||"",customerContact:"",customerNote:"作廢退回單 "+(live.returnNo||""),returnId:returnRef.id,invoiceId:invoiceRef.id,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        }
      }
      itemStates.forEach(state=>tx.update(state.itemRef,{locations:state.item.locations}));
      const nextSettled=Math.max(0,erpAccountingNumber(ledger.settledAmount)-amount);
      tx.update(settlementRef,{status:"void",voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
      tx.update(ledgerRef,{settledAmount:nextSettled,balanceAmount:erpAccountingBalance(ledger.originalAmount,nextSettled),status:erpAccountingStatus(ledger.originalAmount,nextSettled,false),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name});
      tx.update(invoiceRef,{returnedQuantities:nextReturned,returnedAmount:Math.max(0,erpAccountingNumber(invoice.returnedAmount)-amount),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      tx.update(returnRef,{status:"void",voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
    });
    erpAccountingAudit("sales_return_voided",id,{returnNo:shown.returnNo,totalAmount:shown.totalAmount});
  }catch(error){
    console.error(error);
    alert("作廢失敗："+(error.message||""));
  }
}
function renderErpReturns(){
  const el=document.getElementById("erp-page-returns");
  if(!el) return;
  const invoices=erpInvoicesCache.filter(invoice=>invoice.status==="issued").sort((a,b)=>(b.invoiceDate||"").localeCompare(a.invoiceDate||""));
  const invoice=erpReturnInvoiceById(erpReturnFilter.invoiceId);
  const history=erpSalesReturnsCache.slice().sort((a,b)=>{
    const av=a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0;
    const bv=b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0;
    return bv-av;
  });
  el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">SALES RETURNS & ALLOWANCES</p><h1>銷貨退回與折讓</h1><p>退貨入庫才會回補庫存；帳務折讓只沖回應收。兩種操作都會留下可作廢的歷程。</p></div></div>'
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">SELECT INVOICE</p><h2>選擇已開立發票</h2></div></div><div class="erp-invoice-filters"><label>月結發票<select id="erpReturnInvoice"><option value="">請選擇發票</option>'+invoices.map(item=>'<option value="'+erpEscape(item.id)+'"'+(erpReturnFilter.invoiceId===item.id?" selected":"")+">"+erpEscape(item.invoiceNo)+"｜"+erpEscape(item.customerName)+"｜NT$ "+erpMoney(item.totalAmount)+"</option>").join("")+'</select></label><button class="erp-secondary" id="erpReturnSelectBtn">帶入發票明細</button></div></section>'
    + (invoice?erpReturnFormHtml(invoice):"")
    + '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">RETURN HISTORY</p><h2>退回／折讓歷程</h2></div><span class="erp-counter">'+history.length+' 筆</span></div>'
    + (history.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>退回單號</th><th>日期</th><th>類型</th><th>客戶</th><th>原發票</th><th>金額</th><th>狀態</th><th></th></tr></thead><tbody>'+history.map(item=>'<tr><td><strong>'+erpEscape(item.returnNo)+'</strong></td><td>'+erpEscape(item.returnDate||"-")+'</td><td>'+erpEscape(erpReturnTypeLabel(item.returnType))+'</td><td>'+erpEscape(item.customerName||"-")+'</td><td>'+erpEscape(item.invoiceNo||"-")+'</td><td>NT$ '+erpMoney(item.totalAmount)+'</td><td>'+erpEscape(item.status==="void"?"已作廢":"已確認")+'</td><td>'+(item.status==="confirmed"?'<button class="erp-edit-btn" data-erp-return-void="'+erpEscape(item.id)+'">作廢</button>':'')+'</td></tr>').join("")+'</tbody></table></div>':'<div class="erp-empty">尚無退回或折讓紀錄。</div>')
    + '</section>';
  document.getElementById("erpReturnSelectBtn").addEventListener("click",()=>{
    erpReturnFilter={invoiceId:document.getElementById("erpReturnInvoice").value};
    renderErpReturns();
  });
  const form=document.getElementById("erpSalesReturnForm");
  if(form){
    const mode=form.elements.returnType,amount=form.elements.manualAmount;
    const allowanceSection=document.getElementById("erpAllowanceAmountSection");
    const stockLines=document.getElementById("erpStockReturnLines");
    const hint=document.getElementById("erpAllowanceAmountHint");
    const updateAllowanceHint=()=>{
      if(!hint) return;
      try{
        const totals=erpReturnManualTotals(invoice,amount.value);
        hint.textContent="本次折讓：未稅 NT$ "+erpMoney(totals.subtotal)+"｜營業稅 NT$ "+erpMoney(totals.taxAmount)+"｜含稅總額 NT$ "+erpMoney(totals.totalAmount);
      }catch(_){
        hint.textContent="請輸入本次要沖回的含稅金額；系統會依原發票稅別自動拆分未稅金額與營業稅。";
      }
    };
    const updateReturnMode=()=>{
      const allowance=mode.value==="allowance";
      allowanceSection.hidden=!allowance;
      stockLines.hidden=allowance;
      amount.required=allowance;
      stockLines.querySelectorAll("input,select").forEach(field=>field.disabled=allowance);
      updateAllowanceHint();
    };
    mode.addEventListener("change",updateReturnMode);
    amount.addEventListener("input",updateAllowanceHint);
    updateReturnMode();
    form.addEventListener("submit",event=>{event.preventDefault();createErpSalesReturn(invoice,event.currentTarget);});
  }
  el.querySelectorAll("[data-erp-return-void]").forEach(button=>button.addEventListener("click",()=>voidErpSalesReturn(button.dataset.erpReturnVoid)));
}
function erpReturnFormHtml(invoice){
  if(!invoice.ledgerId) return '<section class="erp-panel"><div class="erp-empty"><strong>此為舊版發票。</strong><br>它沒有新通用應收帳，暫時不能建立退回／折讓；新版發票才可使用此功能。</div></section>';
  return '<section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">CREATE CREDIT</p><h2>建立退回／折讓：'+erpEscape(invoice.invoiceNo)+'</h2><p>'+erpEscape(invoice.customerName)+'｜原發票 NT$ '+erpMoney(invoice.totalAmount)+'</p></div></div>'
    + '<form id="erpSalesReturnForm" class="erp-form"><div class="erp-form-row"><label>處理日期<input name="returnDate" type="date" value="'+todayStr()+'" required></label><label>處理方式<select name="returnType"><option value="allowance">帳務折讓（不回補庫存）</option><option value="stock_return">退貨入庫（回補庫存，限管理者）</option></select></label></div><label>原因／備註<textarea name="reason" rows="2" placeholder="例如：客戶折讓、瑕疵補償、退貨說明"></textarea></label><div id="erpAllowanceAmountSection" class="erp-return-lines"><label>折讓含稅總額<input name="manualAmount" type="number" min="1" step="1" inputmode="numeric" placeholder="例如 5000"></label><p id="erpAllowanceAmountHint" class="erp-form-hint">請輸入本次要沖回的含稅金額；系統會依原發票稅別自動拆分未稅金額與營業稅。</p></div><div id="erpStockReturnLines" class="erp-return-lines" hidden>'+erpReturnBuildFormLines(invoice,"stock_return")+'</div><div class="erp-form-actions"><button class="erp-primary">確認建立退回／折讓單</button></div></form></section>';
}
