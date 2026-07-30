// ERP 月結開票與發票資料
function erpDefaultInvoiceRange(){
  const now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),1);
  return {from:first.toISOString().slice(0,10),to:todayStr()};
}
function erpInvoiceCandidates(){
  return erpSalesOrdersCache.filter(o=>o.status==="confirmed"&&!o.invoiceId);
}
function erpInvoiceTotal(orders){
  return orders.reduce((sum,o)=>{const t=erpDisplayTotals(o);sum.subtotal+=t.subtotal;sum.taxAmount+=t.taxAmount;sum.totalAmount+=t.totalAmount;return sum;},{subtotal:0,taxAmount:0,totalAmount:0});
}
function erpInvoiceNumber(){
  const d=new Date(), two=n=>String(n).padStart(2,"0");
  return "INV-"+d.getFullYear()+two(d.getMonth()+1)+two(d.getDate())+"-"+two(d.getHours())+two(d.getMinutes())+two(d.getSeconds());
}
function renderErpInvoices(){
  const el=document.getElementById("erp-page-invoices");
  if(!el) return;
  const range=erpDefaultInvoiceRange();
  if(!erpInvoiceFilter.from) erpInvoiceFilter.from=range.from;
  if(!erpInvoiceFilter.to) erpInvoiceFilter.to=range.to;
  const candidates=erpInvoiceCandidates();
  const customerNames=[...new Set(candidates.map(o=>o.customerName||"未指定客戶"))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));
  const filtered=candidates.filter(o=>(!erpInvoiceFilter.customerName||(o.customerName||"未指定客戶")===erpInvoiceFilter.customerName)&&(!erpInvoiceFilter.from||o.orderDate>=erpInvoiceFilter.from)&&(!erpInvoiceFilter.to||o.orderDate<=erpInvoiceFilter.to));
  el.innerHTML=`
    <div class="erp-page-heading"><div><p class="erp-kicker">MONTHLY INVOICING</p><h1>月結開票</h1><p>選擇同一客戶、同一結帳期間的已確認銷貨單，合併建立一筆月結發票。</p></div></div>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">SELECT SALES DOCUMENTS</p><h2>選取本期銷貨單</h2></div><span class="erp-counter">${filtered.length} 筆可開票</span></div>
      <div class="erp-invoice-filters"><label>客戶<select id="erpInvoiceCustomer"><option value="">請選擇客戶</option>${customerNames.map(n=>'<option value="'+erpEscape(n)+'"'+(erpInvoiceFilter.customerName===n?" selected":"")+">"+erpEscape(n)+"</option>").join("")}</select></label><label>銷貨日期起<input type="date" id="erpInvoiceFrom" value="${erpEscape(erpInvoiceFilter.from)}"></label><label>銷貨日期迄<input type="date" id="erpInvoiceTo" value="${erpEscape(erpInvoiceFilter.to)}"></label><button class="erp-secondary" id="erpInvoiceFilterBtn">套用篩選</button></div>
      ${erpInvoiceFilter.customerName&&filtered.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th><input type="checkbox" id="erpInvoiceSelectAll"></th><th>銷貨日期</th><th>銷貨單號</th><th>品項</th><th>未稅</th><th>稅額</th><th>總計</th><th>稅別</th></tr></thead><tbody>'+filtered.map(o=>{const t=erpDisplayTotals(o);return '<tr><td><input type="checkbox" data-invoice-sale="'+erpEscape(o.id)+'"></td><td>'+erpEscape(o.orderDate||"-")+'</td><td><strong>'+erpEscape(o.orderNo)+'</strong></td><td>'+erpEscape(o.itemName)+' × '+(Number(o.quantity)||0)+'</td><td>NT$ '+erpMoney(t.subtotal)+'</td><td>NT$ '+erpMoney(t.taxAmount)+'</td><td>NT$ '+erpMoney(t.totalAmount)+'</td><td>'+erpTaxLabel(o.taxMode)+'</td></tr>';}).join("")+'</tbody></table></div><div class="erp-invoice-total" id="erpInvoiceTotal"><span>請勾選銷貨單以計算本次月結金額。</span></div><div class="erp-form-actions"><button class="erp-primary" id="erpCreateInvoiceBtn">建立月結發票</button></div>':(erpInvoiceFilter.customerName?'<div class="erp-empty">此客戶在選定期間沒有尚未開票的已確認銷貨單。</div>':'<div class="erp-empty"><strong>請先選擇客戶。</strong><br>系統只會將同一個客戶的銷貨單合併開票，避免帳務混在一起。</div>')}
    </section>
    <section class="erp-panel"><div class="erp-panel-title"><div><p class="erp-kicker">INVOICE HISTORY</p><h2>已建立的月結發票</h2></div><span class="erp-counter">${erpInvoicesCache.length} 筆</span></div>
      ${erpInvoicesCache.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>發票編號</th><th>客戶</th><th>開票日期</th><th>銷貨單數</th><th>未稅</th><th>稅額</th><th>總計</th><th></th></tr></thead><tbody>'+erpInvoicesCache.map(inv=>'<tr><td><strong>'+erpEscape(inv.invoiceNo)+'</strong></td><td>'+erpEscape(inv.customerName)+'</td><td>'+erpEscape(inv.invoiceDate||"-")+'</td><td>'+((inv.saleOrderIds||[]).length)+' 筆</td><td>NT$ '+erpMoney(inv.subtotalAmount)+'</td><td>NT$ '+erpMoney(inv.taxAmount)+'</td><td><strong>NT$ '+erpMoney(inv.totalAmount)+'</strong></td><td><button class="erp-print-btn" data-erp-print-invoice="'+erpEscape(inv.id)+'">預覽列印</button><button class="erp-edit-btn" data-invoice-void="'+erpEscape(inv.id)+'">作廢</button></td></tr>').join("")+'</tbody></table></div>':'<div class="erp-empty">尚未建立月結發票。</div>'}
    </section>`;
  document.getElementById("erpInvoiceFilterBtn").addEventListener("click",()=>{
    erpInvoiceFilter={customerName:document.getElementById("erpInvoiceCustomer").value,from:document.getElementById("erpInvoiceFrom").value,to:document.getElementById("erpInvoiceTo").value};renderErpInvoices();
  });
  const checkboxes=[...el.querySelectorAll("[data-invoice-sale]")];
  const updateTotal=()=>{
    const picked=checkboxes.filter(x=>x.checked).map(x=>erpSalesOrdersCache.find(o=>o.id===x.dataset.invoiceSale)).filter(Boolean);
    const t=erpInvoiceTotal(picked), box=document.getElementById("erpInvoiceTotal");
    if(box) box.innerHTML='<div><span>本次合併銷貨單</span><strong>'+picked.length+' 筆</strong></div><div><span>未稅金額</span><strong>NT$ '+erpMoney(t.subtotal)+'</strong></div><div><span>營業稅 5%</span><strong>NT$ '+erpMoney(t.taxAmount)+'</strong></div><div class="erp-grand-total"><span>含稅總計</span><strong>NT$ '+erpMoney(t.totalAmount)+'</strong></div>';
  };
  const all=document.getElementById("erpInvoiceSelectAll");if(all)all.addEventListener("change",()=>{checkboxes.forEach(x=>x.checked=all.checked);updateTotal();});
  checkboxes.forEach(x=>x.addEventListener("change",updateTotal));
  const create=document.getElementById("erpCreateInvoiceBtn");if(create)create.addEventListener("click",createErpInvoice);
  el.querySelectorAll("[data-erp-print-invoice]").forEach(btn=>btn.addEventListener("click",()=>{const inv=erpInvoicesCache.find(x=>x.id===btn.dataset.erpPrintInvoice);if(inv)openErpPrintPreview(null,inv);}));
  el.querySelectorAll("[data-invoice-void]").forEach(btn=>btn.addEventListener("click",()=>voidErpInvoice(btn.dataset.invoiceVoid)));
}
async function createErpInvoice(){
  const checked=[...document.querySelectorAll("[data-invoice-sale]:checked")];
  const selected=checked.map(x=>erpSalesOrdersCache.find(o=>o.id===x.dataset.invoiceSale)).filter(Boolean);
  if(!selected.length)return alert("請至少選擇一筆銷貨單。");
  const customerName=erpInvoiceFilter.customerName;
  if(!customerName||selected.some(o=>(o.customerName||"未指定客戶")!==customerName))return alert("月結發票只能合併同一位客戶的銷貨單。");
  if(selected.some(o=>o.status!=="confirmed"||o.invoiceId))return alert("選取內容已變更，請重新整理後再試。");
  const totals=erpInvoiceTotal(selected);
  if(!confirm("建立「"+customerName+"」的月結發票？\n共 "+selected.length+" 筆銷貨單，含稅總計 NT$ "+erpMoney(totals.totalAmount)+"。\n建立後將無法再次納入其他月結發票。"))return;
  const ref=db.collection("erpInvoices").doc();
  const invoiceNo=erpInvoiceNumber();
  const customer=erpCustomersCache.find(c=>(c.name||"")===customerName);
  const lines=selected.map(o=>{const t=erpDisplayTotals(o);return {saleOrderId:o.id,orderNo:o.orderNo,orderDate:o.orderDate,itemName:o.itemName,quantity:Number(o.quantity)||0,unitPrice:Number(o.unitPrice)||0,taxMode:o.taxMode||"no_tax",subtotalAmount:t.subtotal,taxAmount:t.taxAmount,totalAmount:t.totalAmount};});
  const batch=db.batch();
  batch.set(ref,{invoiceNo,invoiceDate:todayStr(),customerId:customer?customer.id:null,customerName,periodFrom:erpInvoiceFilter.from,periodTo:erpInvoiceFilter.to,saleOrderIds:selected.map(o=>o.id),lines,subtotalAmount:totals.subtotal,taxAmount:totals.taxAmount,totalAmount:totals.totalAmount,taxRate:0.05,status:"issued",createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
  selected.forEach(o=>batch.update(db.collection("erpSalesOrders").doc(o.id),{invoiceId:ref.id,invoiceNo, invoicedAt:firebase.firestore.FieldValue.serverTimestamp()}));
  try{await batch.commit();alert("月結發票已建立。你現在可以在下方的「已建立的月結發票」預覽列印。");}
  catch(err){console.error(err);alert("建立月結發票失敗。請確認 Firebase Rules 已加入 erpInvoices 權限後再試。");}
}

async function createErpInvoice(){
  const selected=[...document.querySelectorAll("[data-invoice-sale]:checked")].map(x=>erpSalesOrdersCache.find(o=>o.id===x.dataset.invoiceSale)).filter(Boolean);
  const customerName=erpInvoiceFilter.customerName;
  if(!selected.length)return alert("請至少選擇一筆銷貨單。");
  if(!customerName||selected.some(o=>(o.customerName||"未指定客戶")!==customerName||o.status!=="confirmed"||o.invoiceId))return alert("選取內容已變更，請重新整理後再試。");
  const totals=erpInvoiceTotal(selected);
  if(!confirm("建立月結發票？含稅總計 NT$ "+erpMoney(totals.totalAmount)+"。"))return;
  const invoiceRef=db.collection("erpInvoices").doc(), receivableRef=db.collection("erpReceivables").doc(), invoiceNo=erpInvoiceNumber();
  const customer=erpCustomersCache.find(c=>(c.name||"")===customerName);
  const lines=selected.flatMap(o=>erpOrderLines(o).map(l=>({saleOrderId:o.id,orderNo:o.orderNo,orderDate:o.orderDate,itemName:l.itemName,quantity:Number(l.quantity)||0,unitPrice:Number(l.unitPrice)||0,subtotalAmount:Math.round((Number(l.quantity)||0)*(Number(l.unitPrice)||0))})));
  const invoice={invoiceNo,invoiceDate:todayStr(),customerId:customer?customer.id:null,customerName,periodFrom:erpInvoiceFilter.from,periodTo:erpInvoiceFilter.to,saleOrderIds:selected.map(o=>o.id),lines,subtotalAmount:totals.subtotal,taxAmount:totals.taxAmount,totalAmount:totals.totalAmount,taxRate:.05,status:"issued",createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name};
  const batch=db.batch();batch.set(invoiceRef,invoice);batch.set(receivableRef,{invoiceId:invoiceRef.id,invoiceNo,invoiceDate:invoice.invoiceDate,customerId:invoice.customerId,customerName,originalAmount:totals.totalAmount,receivedAmount:0,balanceAmount:totals.totalAmount,status:"open",createdAt:firebase.firestore.FieldValue.serverTimestamp()});
  selected.forEach(o=>batch.update(db.collection("erpSalesOrders").doc(o.id),{invoiceId:invoiceRef.id,invoiceNo,invoicedAt:firebase.firestore.FieldValue.serverTimestamp()}));
  try{await batch.commit();alert("月結發票與應收帳款已建立。");}catch(e){console.error(e);alert("建立失敗，請確認 Firebase Rules 已加入 erpInvoices 與 erpReceivables 權限。");}
}

async function voidErpInvoice(id){const inv=erpInvoicesCache.find(x=>x.id===id);if(!inv||inv.status==="void")return;const ar=erpReceivablesCache.find(x=>x.invoiceId===id);if(ar&&(Number(ar.receivedAmount)||0)>0)return alert("此月結已有收款，請先作廢相關收款後才能作廢月結。");if(!confirm("作廢此月結發票？來源銷貨單將恢復為未月結。"))return;const batch=db.batch();batch.update(db.collection("erpInvoices").doc(id),{status:"void",voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});if(ar)batch.update(db.collection("erpReceivables").doc(ar.id),{status:"void",balanceAmount:0,voidedAt:firebase.firestore.FieldValue.serverTimestamp()});(inv.saleOrderIds||[]).forEach(sid=>batch.update(db.collection("erpSalesOrders").doc(sid),{invoiceId:firebase.firestore.FieldValue.delete(),invoiceNo:firebase.firestore.FieldValue.delete(),invoicedAt:firebase.firestore.FieldValue.delete()}));try{await batch.commit();logErpAudit("invoice_voided",id,{invoiceNo:inv.invoiceNo});}catch(e){console.error(e);alert("作廢失敗。");}}
