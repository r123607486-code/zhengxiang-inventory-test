// ERP 通用帳務核心：資料結構、餘額計算、舊應收安全轉入
// 本檔不處理畫面與表單，供 erp-ledger／erp-settlements／erp-instruments 共用。

const ERP_ACCOUNTING = {
  ledger:"erpLedger",
  settlements:"erpSettlements",
  instruments:"erpInstruments"
};

function erpAccountingNumber(value){
  const n=Number(value);
  return Number.isFinite(n) ? n : 0;
}
function erpAccountingStatus(originalAmount, settledAmount, voided){
  if(voided) return "void";
  const original=Math.max(0,erpAccountingNumber(originalAmount));
  const settled=Math.max(0,erpAccountingNumber(settledAmount));
  if(original===0) return "settled";
  if(settled<=0) return "open";
  if(settled>=original) return "settled";
  return "partial";
}
function erpAccountingBalance(originalAmount, settledAmount){
  return Math.max(0,erpAccountingNumber(originalAmount)-erpAccountingNumber(settledAmount));
}
function erpAccountingDirectionLabel(direction){
  return direction==="payable" ? "應付" : "應收";
}
function erpAccountingStatusLabel(status){
  return ({open:"未結清",partial:"部分沖帳",settled:"已結清",void:"已作廢"}[status]||"未結清");
}
function erpAccountingOpenLedgers(){
  return erpLedgerCache.filter(entry =>
    entry.status!=="void" && erpAccountingNumber(entry.balanceAmount)>0
  );
}
function erpAccountingSettlementNo(){
  const d=new Date(),two=n=>String(n).padStart(2,"0");
  return "ST-"+d.getFullYear()+two(d.getMonth()+1)+two(d.getDate())+"-"+two(d.getHours())+two(d.getMinutes())+two(d.getSeconds())+"-"+String(d.getMilliseconds()).padStart(3,"0");
}
function erpAccountingAudit(action,targetId,detail){
  return db.collection("erpAuditLogs").add({
    action,targetId,detail:detail||{},
    createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    operatorUid:currentUser.uid,
    operatorName:currentUser.name
  }).catch(error=>console.warn("ERP audit log unavailable",error));
}
function erpAccountingLegacyLedger(receivable){
  const original=Math.max(0,erpAccountingNumber(receivable.originalAmount));
  const settled=Math.max(0,erpAccountingNumber(receivable.receivedAmount));
  return {
    id:"legacy:"+receivable.id,
    legacy:true,
    legacyReceivableId:receivable.id,
    ledgerNo:"舊版-"+(receivable.invoiceNo||receivable.id),
    direction:"receivable",
    sourceType:"legacy_receivable",
    sourceDocumentNo:receivable.invoiceNo||"",
    partyId:receivable.customerId||null,
    partyName:receivable.customerName||"",
    documentDate:receivable.invoiceDate||"",
    originalAmount:original,
    settledAmount:settled,
    balanceAmount:Math.max(0,erpAccountingNumber(receivable.balanceAmount)),
    status:receivable.status==="void" ? "void" : erpAccountingStatus(original,settled,false),
    notes:"舊版應收資料（尚未轉入通用帳務層）"
  };
}
function erpAccountingAllVisibleLedgers(){
  const current=erpLedgerCache.slice();
  const migrated=new Set(current.filter(x=>x.legacySourceId).map(x=>x.legacySourceId));
  const legacy=erpReceivablesCache
    .filter(x=>!migrated.has(x.id))
    .map(erpAccountingLegacyLedger);
  return current.concat(legacy).sort((a,b)=>{
    const av=(a.documentDate||"")+" "+(a.ledgerNo||"");
    const bv=(b.documentDate||"")+" "+(b.ledgerNo||"");
    return bv.localeCompare(av,"zh-Hant");
  });
}
async function erpAccountingMigrateLegacyReceivable(legacyId){
  const old=erpReceivablesCache.find(x=>x.id===legacyId);
  if(!old) throw new Error("找不到舊版應收資料，請重新整理後再試。");
  const ledgerRef=db.collection(ERP_ACCOUNTING.ledger).doc("legacy_receivable_"+legacyId);
  await db.runTransaction(async tx=>{
    const existing=await tx.get(ledgerRef);
    if(existing.exists) return;
    const original=Math.max(0,erpAccountingNumber(old.originalAmount));
    const settled=Math.max(0,erpAccountingNumber(old.receivedAmount));
    tx.set(ledgerRef,{
      ledgerNo:"AR-LEGACY-"+(old.invoiceNo||legacyId),
      direction:"receivable",
      sourceType:"legacy_receivable",
      sourceId:legacyId,
      sourceDocumentNo:old.invoiceNo||"",
      legacySourceId:legacyId,
      partyId:old.customerId||null,
      partyName:old.customerName||"",
      documentDate:old.invoiceDate||todayStr(),
      dueDate:old.dueDate||"",
      originalAmount:original,
      settledAmount:settled,
      balanceAmount:erpAccountingBalance(original,settled),
      status:erpAccountingStatus(original,settled,old.status==="void"),
      notes:"由舊版 erpReceivables 安全轉入；原資料保留不修改。",
      createdAt:firebase.firestore.FieldValue.serverTimestamp(),
      createdByUid:currentUser.uid,
      createdByName:currentUser.name,
      migratedAt:firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  erpAccountingAudit("legacy_receivable_migrated",ledgerRef.id,{legacyReceivableId:legacyId});
  return ledgerRef.id;
}
