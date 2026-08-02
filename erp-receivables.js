// 舊版應收與收款畫面已由通用帳務層取代：
//   應收／應付清單 → erp-ledger.js（帳務與收款頁）
//   收款／付款沖帳 → erp-settlements.js
//   票據（支票）    → erp-instruments.js
// 原本這裡的 renderErpReceivables／openReceiptForm／saveErpReceipt／voidErpReceipt
// 已經沒有對應的畫面區塊（erp-page-receivables 不存在），屬於永遠不會執行的死碼，故移除。
// 舊資料本身完全保留：erpReceivables／erpReceipts 仍會被讀取，在帳務頁以「舊版保留」顯示，
// 並可用「轉入新帳務」逐筆搬到 erpLedger。
//
// 這個檔案只留下 logErpAudit，因為 erp-sales.js 的刪除草稿還在用它。
// 新寫的模組請改用 erp-accounting-core.js 的 erpAccountingAudit()。
function logErpAudit(action,targetId,detail){
  return db.collection("erpAuditLogs").add({
    action,targetId,detail,
    createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    operatorUid:currentUser.uid,
    operatorName:currentUser.name
  }).catch(e=>console.warn("Audit log unavailable",e));
}
