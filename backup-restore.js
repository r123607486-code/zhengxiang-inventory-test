// ============================================================
// 完整備份匯出／還原（輪胎＋KYB）
// ============================================================
document.getElementById("exportAllBtn").addEventListener("click", ()=>{
  exportFullBackup();
});

async function exportFullBackup(){
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemsCache.map(it=>({
    id:it.id, 品牌:it.brand, 型號:it.model, 規格:it.spec, 總量:totalQty(it),
    儲位分布:locSummary(it), "20%":it.twenty!=null?it.twenty:"", 售價:it.sellPrice!=null?it.sellPrice:"", 備註:it.remark||""
  }))), "品項主檔");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(locationsCache.map(l=>({儲位代碼:l.code}))), "儲位主檔");
  const txnSnap = await db.collection("transactions").get();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txnSnap.docs.map(d=>d.data())), "進出貨紀錄");

  const kybItemsSnap = await db.collection("kybItems").get();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kybItemsSnap.docs.map(d=>{
    const it = {id:d.id, ...d.data()};
    return {
      id: it.id, 車型: it.carModel, 廠牌: it.carMake||"", 避震款式: it.bucketType||"", 總量: kybTotalQty(it),
      儲位分布: kybLocSummary(it), 年份代碼: it.yearCode||"", 料號: it.partNo||"",
      保修廠價: it.warrantyPrice!=null?it.warrantyPrice:"", 一線消費者售價: it.catalogPrice!=null?it.catalogPrice:"",
      備註: it.remark||""
    };
  })), "KYB品項主檔");
  const kybLocSnap = await db.collection("kybLocations").get();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kybLocSnap.docs.map(d=>({儲位代碼:d.data().code}))), "KYB儲位主檔");
  const kybTxnSnap = await db.collection("kybTransactions").get();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kybTxnSnap.docs.map(d=>d.data())), "KYB進出貨紀錄");

  XLSX.writeFile(wb, `完整備份_${todayStr()}.xlsx`);
}

async function restoreFullBackup(wb, statusEl){
  const hasKybSheets = !!(wb.Sheets["KYB品項主檔"] || wb.Sheets["KYB儲位主檔"] || wb.Sheets["KYB進出貨紀錄"]);
  const ok = confirm(
    "偵測到這是「完整備份」檔案。\n\n" +
    "還原會先清除目前所有品項、儲位、進出貨紀錄" + (hasKybSheets ? "（含輪胎與KYB兩邊）" : "（這份備份沒有KYB資料，只會還原輪胎，KYB維持現狀不動）") + "，換成這份備份「當時」的內容（含當時的成本、儲位、生產日期）。\n" +
    "此動作無法復原，請確認這是你要的備份時間點。\n\n確定要繼續還原嗎？"
  );
  if(!ok){ statusEl.textContent = "已取消還原。"; return; }

  statusEl.textContent = "清除目前資料中...";
  const itemsSnap = await db.collection("items").get();
  const locSnap = await db.collection("locations").get();
  const txnSnap = await db.collection("transactions").get();
  let allDocs = [...itemsSnap.docs, ...locSnap.docs, ...txnSnap.docs];
  if(hasKybSheets){
    const kybItemsSnap = await db.collection("kybItems").get();
    const kybLocSnap = await db.collection("kybLocations").get();
    const kybTxnSnap = await db.collection("kybTransactions").get();
    allDocs = allDocs.concat(kybItemsSnap.docs, kybLocSnap.docs, kybTxnSnap.docs);
  }
  let done = 0;
  while(done < allDocs.length){
    const batch = db.batch();
    allDocs.slice(done, done+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
    done += 400;
  }

  const itemRows = XLSX.utils.sheet_to_json(wb.Sheets["品項主檔"] || {});
  const locRows = XLSX.utils.sheet_to_json(wb.Sheets["儲位主檔"] || {});
  const txnRows = wb.Sheets["進出貨紀錄"] ? XLSX.utils.sheet_to_json(wb.Sheets["進出貨紀錄"]) : [];

  let count = 0;
  while(count < itemRows.length){
    const batch = db.batch();
    itemRows.slice(count, count+400).forEach(r=>{
      const id = (r["id"] || "").toString().trim();
      if(!id) return;
      batch.set(db.collection("items").doc(id), {
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: parseLocSummaryText(r["儲位分布"]),
        twenty: (r["20%"] === undefined || r["20%"] === null || r["20%"] === "") ? null : Number(r["20%"]),
        sellPrice: (r["售價"] === undefined || r["售價"] === null || r["售價"] === "") ? null : Number(r["售價"]),
        remark: r["備註"] || ""
      });
    });
    await batch.commit();
    count += 400;
    statusEl.textContent = `還原品項中...${Math.min(count,itemRows.length)}/${itemRows.length}`;
  }

  count = 0;
  while(count < locRows.length){
    const batch = db.batch();
    locRows.slice(count, count+400).forEach(r=>{
      const code = (r["儲位代碼"] || "").toString().trim();
      if(!code) return;
      batch.set(db.collection("locations").doc(), {code});
    });
    await batch.commit();
    count += 400;
  }

  count = 0;
  while(count < txnRows.length){
    const batch = db.batch();
    txnRows.slice(count, count+400).forEach(r=>{
      batch.set(db.collection("transactions").doc(), {
        itemId: r["itemId"] || "",
        type: r["type"] || "in",
        qty: Number(r["qty"]) || 0,
        loc: r["loc"] || "",
        date: r["date"] || todayStr(),
        operator: r["operator"] || "",
        editLog: []
      });
    });
    await batch.commit();
    count += 400;
    statusEl.textContent = `還原進出貨紀錄中...${Math.min(count,txnRows.length)}/${txnRows.length}`;
  }

  let kybItemRows = [], kybLocRows = [], kybTxnRows = [];
  if(hasKybSheets){
    kybItemRows = wb.Sheets["KYB品項主檔"] ? XLSX.utils.sheet_to_json(wb.Sheets["KYB品項主檔"]) : [];
    kybLocRows = wb.Sheets["KYB儲位主檔"] ? XLSX.utils.sheet_to_json(wb.Sheets["KYB儲位主檔"]) : [];
    kybTxnRows = wb.Sheets["KYB進出貨紀錄"] ? XLSX.utils.sheet_to_json(wb.Sheets["KYB進出貨紀錄"]) : [];

    count = 0;
    while(count < kybItemRows.length){
      const batch = db.batch();
      kybItemRows.slice(count, count+400).forEach(r=>{
        const id = (r["id"] || "").toString().trim();
        if(!id) return;
        // 相容舊版備份（沒有廠牌/避震款式/年份代碼/料號/一線消費者售價這幾欄）：讀不到就留空，不會報錯
        batch.set(db.collection("kybItems").doc(id), {
          carModel: r["車型"] || "", brand: "KYB",
          carMake: r["廠牌"] || "",
          bucketType: r["避震款式"] || "",
          yearCode: r["年份代碼"] || "",
          partNo: r["料號"] || "",
          locations: parseKybLocSummaryText(r["儲位分布"]),
          catalogPrice: (r["一線消費者售價"] === undefined || r["一線消費者售價"] === null || r["一線消費者售價"] === "")
            ? ((r["牌價"] === undefined || r["牌價"] === null || r["牌價"] === "") ? null : Number(r["牌價"]))
            : Number(r["一線消費者售價"]),
          warrantyPrice: (r["保修廠價"] === undefined || r["保修廠價"] === null || r["保修廠價"] === "")
            ? ((r["保修廠"] === undefined || r["保修廠"] === null || r["保修廠"] === "") ? null : Number(r["保修廠"]))
            : Number(r["保修廠價"]),
          remark: r["備註"] || ""
        });
      });
      await batch.commit();
      count += 400;
      statusEl.textContent = `還原KYB品項中...${Math.min(count,kybItemRows.length)}/${kybItemRows.length}`;
    }

    count = 0;
    while(count < kybLocRows.length){
      const batch = db.batch();
      kybLocRows.slice(count, count+400).forEach(r=>{
        const code = (r["儲位代碼"] || "").toString().trim();
        if(!code) return;
        batch.set(db.collection("kybLocations").doc(), {code});
      });
      await batch.commit();
      count += 400;
    }

    count = 0;
    while(count < kybTxnRows.length){
      const batch = db.batch();
      kybTxnRows.slice(count, count+400).forEach(r=>{
        batch.set(db.collection("kybTransactions").doc(), {
          itemId: r["itemId"] || "",
          type: r["type"] || "in",
          qty: Number(r["qty"]) || 0,
          loc: r["loc"] || "",
          date: r["date"] || todayStr(),
          operator: r["operator"] || "",
          editLog: []
        });
      });
      await batch.commit();
      count += 400;
      statusEl.textContent = `還原KYB進出貨紀錄中...${Math.min(count,kybTxnRows.length)}/${kybTxnRows.length}`;
    }
  }

  statusEl.textContent = `還原完成！共還原 ${itemRows.length} 筆品項、${locRows.length} 個儲位、${txnRows.length} 筆進出貨紀錄`
    + (hasKybSheets ? `，以及KYB ${kybItemRows.length} 筆車型、${kybLocRows.length} 個儲位、${kybTxnRows.length} 筆進出貨紀錄` : "（這份備份沒有KYB資料，KYB維持原狀）")
    + `（提醒：每筆紀錄過去的逐次編輯歷程無法透過Excel完整保留，但庫存數量、成本、儲位、生產日期都已正確還原）。`;
}
