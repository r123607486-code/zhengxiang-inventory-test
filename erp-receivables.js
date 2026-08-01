// ERP 應收帳款、完整收款表單、修改與作廢
function logErpAudit(action,targetId,detail){
  return db.collection("erpAuditLogs").add({action,targetId,detail,createdAt:firebase.firestore.FieldValue.serverTimestamp(),operatorUid:currentUser.uid,operatorName:currentUser.name}).catch(e=>console.warn("Audit log unavailable",e));
}
function renderErpReceivables(){
 const el=document.getElementById("erp-page-receivables");if(!el)return;
 const open=erpReceivablesCache.filter(r=>(Number(r.balanceAmount)||0)>0&&r.status!=="void"),total=open.reduce((s,r)=>s+(Number(r.balanceAmount)||0),0);
 const receipts=erpReceiptsCache.slice().sort((a,b)=>{const av=a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0,bv=b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0;return bv-av;});
 el.innerHTML='<div class="erp-page-heading"><div><p class="erp-kicker">ACCOUNTS RECEIVABLE</p><h1>應收與收款</h1><p>所有修改與作廢都會保留紀錄，作廢收款會自動回補未收金額。</p></div></div><div class="erp-metric-grid"><article class="erp-metric"><span>未收應收</span><strong>NT$ '+erpMoney(total)+'</strong><small>'+open.length+' 筆尚未結清</small></article><article class="erp-metric"><span>有效收款</span><strong>NT$ '+erpMoney(receipts.filter(r=>!r.voided).reduce((s,r)=>s+(Number(r.amount)||0),0))+'</strong><small>不含已作廢收款</small></article><article class="erp-metric"><span>已結清</span><strong>'+erpReceivablesCache.filter(r=>r.status==="paid").length+'</strong><small>張月結發票</small></article></div><section class="erp-panel"><div class="erp-panel-title"><h2>未收應收款</h2><span class="erp-counter">'+open.length+' 筆</span></div>'+(open.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>客戶</th><th>月結發票</th><th>開票日期</th><th>原始金額</th><th>已收</th><th>未收</th><th></th></tr></thead><tbody>'+open.map(r=>'<tr><td>'+erpEscape(r.customerName)+'</td><td><strong>'+erpEscape(r.invoiceNo)+'</strong></td><td>'+erpEscape(r.invoiceDate)+'</td><td>NT$ '+erpMoney(r.originalAmount)+'</td><td>NT$ '+erpMoney(r.receivedAmount)+'</td><td><strong>NT$ '+erpMoney(r.balanceAmount)+'</strong></td><td><button class="erp-primary erp-receipt-btn" data-receivable="'+r.id+'">登錄收款</button></td></tr>').join("")+'</tbody></table></div>':'<div class="erp-empty">目前沒有未收應收款。</div>')+'</section><section class="erp-panel"><div class="erp-panel-title"><h2>收款歷程</h2><span class="erp-counter">'+receipts.length+' 筆</span></div>'+(receipts.length?'<div class="erp-table-wrap"><table class="erp-table"><thead><tr><th>收款日期</th><th>客戶</th><th>方式</th><th>參考資訊</th><th>金額</th><th>狀態</th><th></th></tr></thead><tbody>'+receipts.map(r=>'<tr><td>'+erpEscape(r.receiptDate)+'</td><td>'+erpEscape(r.customerName)+'</td><td>'+erpEscape(r.method)+'</td><td>'+erpEscape(r.referenceNo||"-")+'</td><td>NT$ '+erpMoney(r.amount)+'</td><td>'+(r.voided?'<span class="erp-status erp-status-draft">已作廢</span>':'有效')+'</td><td>'+(!r.voided?'<button class="erp-edit-btn" data-receipt-edit="'+r.id+'">修改</button><button class="erp-edit-btn" data-receipt-void="'+r.id+'">作廢</button>':'')+'</td></tr>').join("")+'</tbody></table></div>':'<div class="erp-empty">尚無收款紀錄。</div>')+'</section>';
 el.querySelectorAll("[data-receivable]").forEach(b=>b.addEventListener("click",()=>openReceiptForm(b.dataset.receivable)));
 el.querySelectorAll("[data-receipt-edit]").forEach(b=>b.addEventListener("click",()=>openReceiptForm(null,b.dataset.receiptEdit)));
 el.querySelectorAll("[data-receipt-void]").forEach(b=>b.addEventListener("click",()=>voidErpReceipt(b.dataset.receiptVoid)));
}
function openReceiptForm(receivableId,receiptId){
 const receipt=receiptId?erpReceiptsCache.find(x=>x.id===receiptId):null,alloc=receipt&&receipt.allocations&&receipt.allocations[0],rec=receivableId?erpReceivablesCache.find(x=>x.id===receivableId):alloc&&erpReceivablesCache.find(x=>x.id===alloc.receivableId);if(!rec)return alert("找不到對應應收款。");
 const old=document.getElementById("erpReceiptOverlay");if(old)old.remove();const max=(Number(rec.balanceAmount)||0)+(receipt?Number(receipt.amount)||0:0),d=receipt||{receiptDate:todayStr(),amount:rec.balanceAmount,method:"匯款",referenceNo:"",notes:""};
 const box=document.createElement("div");box.id="erpReceiptOverlay";box.className="erp-print-overlay";box.innerHTML='<div class="erp-print-paper erp-receipt-form"><h2>'+ (receipt?"修改收款":"登錄收款") +'</h2><p><strong>'+erpEscape(rec.customerName)+'</strong>｜'+erpEscape(rec.invoiceNo)+'｜可收上限 NT$ '+erpMoney(max)+'（僅供參考，實際以送出時的最新餘額為準）</p><form id="erpReceiptForm" class="erp-form"><div class="erp-form-row"><label>收款日期<input name="date" type="date" value="'+erpEscape(d.receiptDate)+'" required></label><label>收款金額<input name="amount" type="number" min="1" value="'+(Number(d.amount)||0)+'" required></label></div><div class="erp-form-row"><label>收款方式<select name="method"><option'+(d.method==="現金"?" selected":"")+'>現金</option><option'+(d.method==="匯款"?" selected":"")+'>匯款</option><option'+(d.method==="支票"?" selected":"")+'>支票</option><option'+(d.method==="刷卡"?" selected":"")+'>刷卡</option><option'+(d.method==="其他"?" selected":"")+'>其他</option></select></label><label>銀行／交易序號<input name="reference" value="'+erpEscape(d.referenceNo||"")+'"></label></div><label>備註<textarea name="notes" rows="2">'+erpEscape(d.notes||"")+'</textarea></label><div class="erp-form-actions"><button type="button" class="erp-secondary" id="closeReceipt">取消</button><button class="erp-primary">儲存收款</button></div></form></div>';document.body.appendChild(box);document.getElementById("closeReceipt").onclick=()=>box.remove();document.getElementById("erpReceiptForm").onsubmit=e=>{e.preventDefault();saveErpReceipt(rec,receipt,e.currentTarget,box);};
}
// 收款登錄／修改：改用 Firestore transaction，交易內重新讀取應收帳款的最新狀態再計算，
// 避免兩個人（或同一人開兩個分頁）同時登錄收款時，其中一筆的金額被另一筆覆蓋掉。
async function saveErpReceipt(rec,old,form,box){
  const amount=Number(form.elements.amount.value);
  if(!Number.isFinite(amount)||amount<=0)return alert("請輸入正確金額。");
  const receivableRef=db.collection("erpReceivables").doc(rec.id);
  const receiptRef=old?db.collection("erpReceipts").doc(old.id):db.collection("erpReceipts").doc();
  const data={receiptDate:form.elements.date.value,amount,method:form.elements.method.value,referenceNo:form.elements.reference.value.trim(),notes:form.elements.notes.value.trim(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name};
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(receivableRef);
      if(!snap.exists) throw new Error("找不到對應應收款，可能已被刪除，請重新整理後再試。");
      const cur=snap.data();
      const oldAmt=old?Number(old.amount)||0:0;
      const received=(Number(cur.receivedAmount)||0)-oldAmt+amount;
      const balance=(Number(cur.balanceAmount)||0)+oldAmt-amount;
      if(balance<0) throw new Error("金額超過目前可收餘額，可能有其他人剛收過款，請重新整理後再試。");
      const status=balance===0?"paid":received>0?"partial":"open";
      if(old){
        tx.update(receiptRef,data);
      }else{
        tx.set(receiptRef,{...data,receiptNo:"RC-"+Date.now(),customerId:rec.customerId||null,customerName:rec.customerName,allocations:[{receivableId:rec.id,invoiceId:rec.invoiceId,amount}],createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
      }
      tx.update(receivableRef,{receivedAmount:received,balanceAmount:balance,status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    });
    box.remove();
    logErpAudit(old?"receipt_updated":"receipt_created",receiptRef.id,{amount,receivableId:rec.id});
  }catch(e){
    console.error(e);
    alert("儲存失敗："+(e.message||"請確認 Firebase Rules 權限。"));
  }
}
async function voidErpReceipt(id){
  const r=erpReceiptsCache.find(x=>x.id===id);if(!r||r.voided)return;
  const alloc=r.allocations&&r.allocations[0];if(!alloc)return alert("找不到對應應收款。");
  if(!confirm("作廢此收款？系統會自動回補應收金額。"))return;
  const receiptRef=db.collection("erpReceipts").doc(id);
  const receivableRef=db.collection("erpReceivables").doc(alloc.receivableId);
  const amount=Number(r.amount)||0;
  try{
    await db.runTransaction(async tx=>{
      const snap=await tx.get(receivableRef);
      if(!snap.exists) throw new Error("找不到對應應收款，可能已被刪除。");
      const cur=snap.data();
      const received=Math.max(0,(Number(cur.receivedAmount)||0)-amount);
      const balance=(Number(cur.balanceAmount)||0)+amount;
      const status=received>0?"partial":"open";
      tx.update(receiptRef,{voided:true,voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
      tx.update(receivableRef,{receivedAmount:received,balanceAmount:balance,status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
    });
    logErpAudit("receipt_voided",id,{amount,receivableId:alloc.receivableId});
  }catch(e){
    console.error(e);
    alert("作廢失敗："+(e.message||""));
  }
}
