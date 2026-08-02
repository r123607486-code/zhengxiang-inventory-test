// ERP 收付款工具：支票、匯款、現金、刷卡等資料
function erpInstrumentNeedsDetail(method){
  return method==="支票";
}
function erpInstrumentFieldsHtml(data){
  const d=data||{};
  return '<div class="erp-form-row erp-instrument-fields">'
    + '<label>銀行／機構<input name="instrumentBank" value="'+erpEscape(d.bank||"")+'" placeholder="支票或匯款可填"></label>'
    + '<label>票據／交易號碼<input name="instrumentNo" value="'+erpEscape(d.instrumentNo||"")+'" placeholder="支票號碼或交易序號"></label>'
    + '</div><div class="erp-form-row erp-instrument-fields">'
    + '<label>票據到期日<input name="instrumentDueDate" type="date" value="'+erpEscape(d.dueDate||"")+'"></label>'
    + '<span class="erp-form-hint">支票請填銀行、票據號碼與到期日；其他方式可選填。</span>'
    + '</div>';
}
function erpInstrumentFormData(form,method,amount){
  return {
    method:method||"其他",
    bank:(form.elements.instrumentBank.value||"").trim(),
    instrumentNo:(form.elements.instrumentNo.value||"").trim(),
    dueDate:form.elements.instrumentDueDate.value||"",
    amount:Math.max(0,erpAccountingNumber(amount))
  };
}
function erpValidateInstrument(data){
  if(data.method!=="支票") return "";
  if(!data.bank||!data.instrumentNo||!data.dueDate){
    return "支票請完整填寫銀行、票據號碼與到期日。";
  }
  return "";
}
function erpWriteInstrument(tx,ref,data,party,settlementId,direction){
  tx.set(ref,{
    instrumentType:data.method,
    bank:data.bank,
    instrumentNo:data.instrumentNo,
    dueDate:data.dueDate,
    amount:data.amount,
    direction:direction||"in",
    partyId:party.partyId||null,
    partyName:party.partyName||"",
    settlementId:settlementId,
    status:"active",
    createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp(),
    updatedByUid:currentUser.uid,
    updatedByName:currentUser.name
  },{merge:true});
}
