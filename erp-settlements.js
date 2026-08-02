// ERP 沖帳：以 Firestore transaction 同步更新帳務餘額，避免重複收款或超收。
function erpSettlementById(id){
  return erpSettlementsCache.find(x=>x.id===id);
}
function erpSettlementLedgerId(settlement){
  const allocation=settlement&&Array.isArray(settlement.allocations)?settlement.allocations[0]:null;
  return allocation?allocation.ledgerId:"";
}
function openErpSettlementForm(ledgerId,settlementId){
  const ledger=erpLedgerCache.find(x=>x.id===ledgerId);
  const old=settlementId?erpSettlementById(settlementId):null;
  if(!ledger) return alert("找不到帳務資料，請重新整理後再試。");
  if(old&&old.status==="void") return alert("已作廢的沖帳不可修改。");
  const oldAmount=old?erpAccountingNumber(old.amount):0;
  const max=erpAccountingNumber(ledger.balanceAmount)+oldAmount;
  const data=old||{
    settlementDate:todayStr(),amount:ledger.balanceAmount,
    method:"匯款",referenceNo:"",notes:"",instrument:{}
  };
  const instrument=old&&old.instrument ? old.instrument : {};
  const overlay=document.getElementById("erpSettlementOverlay");
  if(overlay) overlay.remove();
  const box=document.createElement("div");
  box.id="erpSettlementOverlay";
  box.className="erp-print-overlay";
  box.innerHTML='<div class="erp-print-paper erp-receipt-form">'
    + '<h2>'+(old?"修改收款沖帳":"登錄收款沖帳")+'</h2>'
    + '<p><strong>'+erpEscape(ledger.partyName)+'</strong>｜'+erpEscape(ledger.ledgerNo)
    + '｜目前可收上限 NT$ '+erpMoney(max)+'</p>'
    + '<form id="erpSettlementForm" class="erp-form">'
    + '<div class="erp-form-row"><label>收款日期<input name="date" type="date" value="'+erpEscape(data.settlementDate||todayStr())+'" required></label>'
    + '<label>收款金額<input name="amount" type="number" min="1" step="1" value="'+erpAccountingNumber(data.amount)+'" required></label></div>'
    + '<div class="erp-form-row"><label>收款方式<select name="method">'
    + ["現金","匯款","支票","刷卡","其他"].map(method=>'<option value="'+method+'"'+((data.method===method)?" selected":"")+'>'+method+'</option>').join("")
    + '</select></label><label>銀行／交易序號<input name="reference" value="'+erpEscape(data.referenceNo||"")+'"></label></div>'
    + erpInstrumentFieldsHtml(instrument)
    + '<label>備註<textarea name="notes" rows="2">'+erpEscape(data.notes||"")+'</textarea></label>'
    + '<div class="erp-form-actions"><button type="button" class="erp-secondary" id="closeSettlement">取消</button><button class="erp-primary">儲存沖帳</button></div>'
    + '</form></div>';
  document.body.appendChild(box);
  document.getElementById("closeSettlement").onclick=()=>box.remove();
  document.getElementById("erpSettlementForm").onsubmit=event=>{
    event.preventDefault();
    saveErpSettlement(ledger,old,event.currentTarget,box);
  };
}
async function saveErpSettlement(ledger,old,form,box){
  const amount=erpAccountingNumber(form.elements.amount.value);
  if(amount<=0) return alert("請輸入正確的收款金額。");
  const method=form.elements.method.value;
  const instrument=erpInstrumentFormData(form,method,amount);
  const instrumentError=erpValidateInstrument(instrument);
  if(instrumentError) return alert(instrumentError);
  const ledgerRef=db.collection(ERP_ACCOUNTING.ledger).doc(ledger.id);
  const settlementRef=old?db.collection(ERP_ACCOUNTING.settlements).doc(old.id):db.collection(ERP_ACCOUNTING.settlements).doc();
  try{
    await db.runTransaction(async tx=>{
      const ledgerSnap=await tx.get(ledgerRef);
      if(!ledgerSnap.exists) throw new Error("找不到帳務資料，請重新整理後再試。");
      const live=ledgerSnap.data();
      if(live.status==="void") throw new Error("這筆帳務已作廢，不可再沖帳。");
      const oldAmount=old&&old.status!=="void"?erpAccountingNumber(old.amount):0;
      const original=erpAccountingNumber(live.originalAmount);
      const settled=erpAccountingNumber(live.settledAmount)-oldAmount+amount;
      if(settled>original) throw new Error("金額超過目前可收餘額，可能有其他人剛登錄收款，請重新整理後再試。");
      const balance=erpAccountingBalance(original,settled);
      const status=erpAccountingStatus(original,settled,false);
      let instrumentRef=null;
      const oldInstrumentId=old&&old.instrumentId?old.instrumentId:"";
      if(erpInstrumentNeedsDetail(method)){
        instrumentRef=oldInstrumentId?db.collection(ERP_ACCOUNTING.instruments).doc(oldInstrumentId):db.collection(ERP_ACCOUNTING.instruments).doc();
        erpWriteInstrument(tx,instrumentRef,instrument,live,settlementRef.id);
      }else if(oldInstrumentId){
        tx.set(db.collection(ERP_ACCOUNTING.instruments).doc(oldInstrumentId),{
          status:"void",
          voidedAt:firebase.firestore.FieldValue.serverTimestamp(),
          voidedByUid:currentUser.uid,
          voidedByName:currentUser.name
        },{merge:true});
      }
      const payload={
        settlementNo:old?old.settlementNo:erpAccountingSettlementNo(),
        settlementType:"receipt",
        direction:"in",
        settlementDate:form.elements.date.value,
        amount,
        method,
        referenceNo:(form.elements.reference.value||"").trim(),
        notes:(form.elements.notes.value||"").trim(),
        partyId:live.partyId||null,
        partyName:live.partyName||"",
        allocations:[{ledgerId:ledgerRef.id,amount}],
        instrumentId:instrumentRef?instrumentRef.id:null,
        instrument:instrumentRef?instrument:null,
        status:"active",
        updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
        updatedByUid:currentUser.uid,
        updatedByName:currentUser.name
      };
      if(old) tx.set(settlementRef,payload,{merge:true});
      else tx.set(settlementRef,{...payload,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdByUid:currentUser.uid,createdByName:currentUser.name});
      tx.update(ledgerRef,{settledAmount:settled,balanceAmount:balance,status,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name});
    });
    box.remove();
    erpAccountingAudit(old?"settlement_updated":"settlement_created",settlementRef.id,{ledgerId:ledger.id,amount,method});
  }catch(error){
    console.error(error);
    alert("儲存失敗："+(error.message||"請確認 Firebase Rules 權限。"));
  }
}
async function voidErpSettlement(id){
  const old=erpSettlementById(id);
  if(!old||old.status==="void") return;
  const ledgerId=erpSettlementLedgerId(old);
  if(!ledgerId) return alert("找不到對應帳務資料。");
  if(!confirm("作廢這筆收款沖帳？系統會自動回補帳務餘額。")) return;
  const ledgerRef=db.collection(ERP_ACCOUNTING.ledger).doc(ledgerId);
  const settlementRef=db.collection(ERP_ACCOUNTING.settlements).doc(id);
  try{
    await db.runTransaction(async tx=>{
      const ledgerSnap=await tx.get(ledgerRef);
      if(!ledgerSnap.exists) throw new Error("找不到帳務資料，請重新整理後再試。");
      const live=ledgerSnap.data();
      const amount=erpAccountingNumber(old.amount);
      const original=erpAccountingNumber(live.originalAmount);
      const settled=Math.max(0,erpAccountingNumber(live.settledAmount)-amount);
      tx.update(settlementRef,{status:"void",voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name});
      if(old.instrumentId){
        tx.set(db.collection(ERP_ACCOUNTING.instruments).doc(old.instrumentId),{status:"void",voidedAt:firebase.firestore.FieldValue.serverTimestamp(),voidedByUid:currentUser.uid,voidedByName:currentUser.name},{merge:true});
      }
      tx.update(ledgerRef,{settledAmount:settled,balanceAmount:erpAccountingBalance(original,settled),status:erpAccountingStatus(original,settled,false),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedByUid:currentUser.uid,updatedByName:currentUser.name});
    });
    erpAccountingAudit("settlement_voided",id,{ledgerId,amount:erpAccountingNumber(old.amount)});
  }catch(error){
    console.error(error);
    alert("作廢失敗："+(error.message||""));
  }
}
