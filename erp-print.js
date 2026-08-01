// ERP 銷貨單與月結單預覽列印
function erpPrintRows(lines){
  return lines.map((l,i)=>'<tr><td>'+String(i+1).padStart(2,"0")+'</td><td>'+erpEscape(l.itemName||"-")+'</td><td class="num">'+(Number(l.quantity)||0)+'</td><td class="num">'+erpMoney(l.unitPrice)+'</td><td class="num">'+erpMoney(l.subtotalAmount!=null?l.subtotalAmount:erpDisplayTotals(l).subtotal)+'</td></tr>').join("");
}
function openErpPrintPreview(order,invoice){
  const old=document.getElementById("erpPrintOverlay");if(old)old.remove();
  const isInvoice=!!invoice;
  const customerName=isInvoice?invoice.customerName:order.customerName;
  const customer=erpPartiesCache.find(c=>(isInvoice?invoice.customerId:order.customerId)&&c.id===(isInvoice?invoice.customerId:order.customerId));
  const lines=isInvoice?invoice.lines||[]:erpOrderLines(order).map(l=>({itemName:l.itemName,quantity:l.quantity,unitPrice:l.unitPrice,subtotalAmount:(Number(l.quantity)||0)*(Number(l.unitPrice)||0)}));
  const totals=isInvoice?{subtotal:Number(invoice.subtotalAmount)||0,taxAmount:Number(invoice.taxAmount)||0,totalAmount:Number(invoice.totalAmount)||0}:erpDisplayTotals(order);
  const docNo=isInvoice?invoice.invoiceNo:order.orderNo;
  const docDate=isInvoice?invoice.invoiceDate:order.orderDate;
  const overlay=document.createElement("div");
  overlay.id="erpPrintOverlay";overlay.className="erp-print-overlay";
  overlay.innerHTML='<div class="erp-print-actions"><button class="erp-secondary" id="erpClosePrint">關閉預覽</button><button class="erp-primary" id="erpDoPrint">列印</button></div><article class="erp-print-paper"><header><div><p>ERP SYSTEM DESIGN</p><h1>'+ (isInvoice?"月結銷貨明細／發票預覽":"銷貨單") +'</h1></div><div class="erp-print-docno"><span>單據編號</span><strong>'+erpEscape(docNo)+'</strong></div></header><section class="erp-print-info"><div><span>客戶名稱</span><strong>'+erpEscape(customerName||"未指定客戶")+'</strong></div><div><span>銷貨／開票日期</span><strong>'+erpEscape(docDate||"-")+'</strong></div><div><span>聯絡電話</span><strong>'+erpEscape(customer&&customer.phone||"")+'</strong></div><div><span>統一編號</span><strong>'+erpEscape(customer&&customer.taxId||"")+'</strong></div></section>' +(isInvoice?'<p class="erp-print-period">結帳期間：'+erpEscape(invoice.periodFrom||"-")+" ～ "+erpEscape(invoice.periodTo||"-")+'</p>':'')+'<table class="erp-print-table"><thead><tr><th>項次</th><th>品名／規格</th><th>數量</th><th>單價</th><th>小計</th></tr></thead><tbody>'+erpPrintRows(lines)+'</tbody></table><section class="erp-print-bottom"><div class="erp-print-notes"><span>備註</span><p>'+erpEscape(isInvoice?"本單彙整同一客戶本期已確認銷貨單。":order.notes||"")+'</p></div><div class="erp-print-totals"><div><span>未稅金額</span><strong>NT$ '+erpMoney(totals.subtotal)+'</strong></div><div><span>營業稅（5%）</span><strong>NT$ '+erpMoney(totals.taxAmount)+'</strong></div><div class="total"><span>含稅總計</span><strong>NT$ '+erpMoney(totals.totalAmount)+'</strong></div></div></section><footer><span>經手人：'+erpEscape(isInvoice?(invoice.createdByName||""):(order.salesperson||order.createdByName||""))+'</span><span>此為系統列印預覽單據</span></footer></article>';
  document.body.appendChild(overlay);
  document.getElementById("erpClosePrint").addEventListener("click",()=>overlay.remove());
  document.getElementById("erpDoPrint").addEventListener("click",()=>window.print());
}


// ============================================================
// 第三階段：多品項銷貨單、應收帳款與收款銷帳
// 舊單據仍相容：沒有 lines 的資料會自動視為一個品項。
// ============================================================
