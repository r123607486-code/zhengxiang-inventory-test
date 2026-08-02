// ============================================================
// 完整出貨 → ERP 銷貨單草稿同步
// 只在叫貨單「一次完整確認出貨」成功的 Firestore 交易內呼叫。
// 不處理分批出貨、不建立應收、不開發票；會計後續才確認帳務。
// ============================================================

function erpShipmentDraftId(sourceType, transactionId){
  return "shipment_" + sourceType + "_" + transactionId;
}
function erpShipmentDraftOrderNo(sourceType, transactionId, date){
  const compactDate = String(date || todayStr()).replace(/[^0-9]/g, "");
  return "SO-" + compactDate + "-" + (sourceType === "tire" ? "T" : "K") + String(transactionId).slice(0, 6).toUpperCase();
}
function createErpShipmentDraft(tx, { sourceType, transactionRef, order, orderId, date, now }){
  const transactionId = transactionRef.id;
  const draftRef = db.collection("erpSalesOrders").doc(erpShipmentDraftId(sourceType, transactionId));
  const pricing = salesPricingStoredFields({...order, itemSource:sourceType}, Number(order.qty)||0);
  const line = {
    itemSource:sourceType,
    itemId:order.itemId || "",
    itemName:order.itemLabel || "",
    quantity:Number(order.qty)||0,
    unitPrice:pricing.unitPrice
  };
  tx.set(draftRef, {
    orderNo:erpShipmentDraftOrderNo(sourceType, transactionId, date),
    orderDate:date,
    customerId:order.customerId || null,
    customerCode:order.customerCode || "",
    customerName:order.customerName || "",
    salesperson:order.requestedByName || "",
    taxMode:pricing.taxMode,
    lines:[line],
    itemSource:sourceType,
    itemName:line.itemName,
    quantity:line.quantity,
    unitPrice:line.unitPrice,
    ...pricing,
    notes:order.customerNote || "",
    status:"draft",
    sourceType,
    sourceTransactionId:transactionId,
    sourceOrderId:orderId,
    sourceCustomerContact:order.customerContact || "",
    autoCreated:true,
    autoCreatedFrom:"confirmed_shipment",
    shipmentConfirmedAt:now,
    createdAt:now,
    createdByUid:currentUser.uid,
    createdByName:currentUser.name
  });
  return draftRef;
}
