// ============================================================
// 輪胎／KYB 資料匯入（含格式偵測）
// ============================================================
document.getElementById("clearDataBtn").addEventListener("click", async ()=>{
  if(!confirm("確定要清除所有「品項」與「儲位」資料嗎？（不會動到使用者帳號跟進出貨紀錄）這通常是為了重新匯入正確的資料才做，確定要繼續嗎？")) return;
  const statusEl = document.getElementById("importStatus");
  statusEl.textContent = "清除中...";
  const itemsSnap = await db.collection("items").get();
  const locSnap = await db.collection("locations").get();
  const allDocs = [...itemsSnap.docs, ...locSnap.docs];
  let done = 0;
  while(done < allDocs.length){
    const batch = db.batch();
    allDocs.slice(done, done+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
    done += 400;
  }
  statusEl.textContent = `已清除 ${itemsSnap.size} 筆品項與 ${locSnap.size} 筆儲位資料，可以重新選檔匯入了。`;
});

document.getElementById("importBtn").addEventListener("click", async ()=>{
  const fileInput = document.getElementById("importFile");
  const statusEl = document.getElementById("importStatus");
  if(!fileInput.files.length){ alert("請先選擇檔案"); return; }
  statusEl.textContent = "讀取檔案中...";
  const file = fileInput.files[0];
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {type:"array"});

  if(wb.Sheets["交接資訊"]){
    await restoreHandoverBackup(wb, statusEl);
    return;
  }

  if(wb.Sheets["品項主檔"] && wb.Sheets["儲位主檔"]){
    await restoreFullBackup(wb, statusEl);
    return;
  }

  if(await tryImportSailunSheet(wb, statusEl)) return;

  const knownLocationCodes = new Set(locationsCache.map(l=>l.code));
  const newItems = [];

  const sheet1 = wb.Sheets["已比對成功(總倉屏東分開)"];
  if(sheet1){
    const rows = XLSX.utils.sheet_to_json(sheet1);
    rows.forEach(r=>{
      const zongCode = (r["總倉儲位代碼"] || "總倉(未指定儲位)").toString().trim();
      const zongQty = Number(r["總倉數量"]) || 0;
      const pingQty = Number(r["屏東數量"]) || 0;
      const yearRaw = (r["年分"] || "").toString().trim() || null;
      const locs = {};
      if(zongQty > 0){ locs[zongCode] = {qty:zongQty, productionDate:yearRaw}; knownLocationCodes.add(zongCode); }
      if(pingQty > 0){ locs["屏東"] = {qty:pingQty, productionDate:yearRaw}; knownLocationCodes.add("屏東"); }
      const costVal = r["成本(已套1.25)"];
      newItems.push({
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: locs, remark: r["備註"] || "",
        twenty: (costVal === undefined || costVal === null || costVal === "") ? null : Number(costVal),
        sellPrice: null
      });
    });
  }

  const sheet2 = wb.Sheets["其他品牌(此檔未涵蓋位區成本)"];
  if(sheet2){
    const rows = XLSX.utils.sheet_to_json(sheet2);
    rows.forEach(r=>{
      const zongQty = Number(r["總倉數量"]) || 0;
      const pingQty = Number(r["屏東數量"]) || 0;
      const locs = {};
      if(zongQty > 0){ locs["總倉(未指定儲位)"] = {qty:zongQty, productionDate:null}; knownLocationCodes.add("總倉(未指定儲位)"); }
      if(pingQty > 0){ locs["屏東"] = {qty:pingQty, productionDate:null}; knownLocationCodes.add("屏東"); }
      newItems.push({
        brand: r["品牌"] || "", model: r["型號"] || "", spec: r["規格"] || "",
        locations: locs, remark: r["備註"] || "", twenty: null, sellPrice: null
      });
    });
  }

  if(newItems.length === 0){ statusEl.textContent = "找不到可匯入的分頁，請確認上傳的是「庫存資料整併結果.xlsx」"; return; }

  statusEl.textContent = `匯入中...共 ${newItems.length} 筆品項，${knownLocationCodes.size} 個儲位`;

  for(const code of knownLocationCodes){
    if(!locationsCache.some(l=>l.code===code)){
      await db.collection("locations").add({code});
    }
  }

  let count = 0;
  while(count < newItems.length){
    const batch = db.batch();
    const chunk = newItems.slice(count, count+400);
    chunk.forEach(it=>{
      const ref = db.collection("items").doc();
      batch.set(ref, it);
    });
    await batch.commit();
    count += chunk.length;
    statusEl.textContent = `匯入中...已完成 ${count}/${newItems.length}`;
  }

  statusEl.textContent = `匯入完成！共新增 ${newItems.length} 筆品項。可以到「庫存查詢」或「庫存總表」查看。`;
});

function parseLocSummaryText(str){
  const locs = {};
  if(!str || str === "-") return locs;
  str.toString().split("、").forEach(pair=>{
    const m = /^(.+)×(\d+)(?:\((.+)\))?$/.exec(pair.trim());
    if(!m) return;
    const code = m[1];
    if(!locs[code]) locs[code] = [];
    locs[code].push({ qty: Number(m[2]), productionDate: m[3] || null });
  });
  return locs;
}

function parseKybLocSummaryText(str){
  const locs = {};
  if(!str || str === "-") return locs;
  str.toString().split("、").forEach(pair=>{
    const m = /^(.+)×(\d+)$/.exec(pair.trim());
    if(!m) return;
    locs[m[1]] = Number(m[2]);
  });
  return locs;
}

function detectSailunSheet(wb){
  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, blankrows:true});
    for(let r=0; r<Math.min(rows.length, 10); r++){
      const row = rows[r] || [];
      if(row.includes("品名規格") && row.includes("花紋")){
        return { rows, headerRowIndex: r };
      }
    }
  }
  return null;
}

async function tryImportSailunSheet(wb, statusEl){
  const detected = detectSailunSheet(wb);
  if(!detected) return false;

  const header = detected.rows[detected.headerRowIndex];
  const specIdx = header.indexOf("品名規格");
  const modelIdx = header.indexOf("花紋");
  const twentyIdx = modelIdx + 1;
  const priceIdx = modelIdx + 2;
  const remarkIdx = header.indexOf("備註");

  const dataRows = detected.rows.slice(detected.headerRowIndex + 1);
  const merged = new Map();
  let skippedCount = 0;

  dataRows.forEach(row=>{
    if(!row) return;
    const specRaw = row[specIdx];
    const modelRaw = row[modelIdx];
    const specStr = (specRaw==null?"":specRaw).toString().trim();
    const modelStr = (modelRaw==null?"":modelRaw).toString().trim();
    if(!specStr && !modelStr) return;
    const remarkStr = remarkIdx>=0 ? (row[remarkIdx]==null?"":row[remarkIdx].toString()) : "";
    if(remarkStr.includes("下市")){ skippedCount++; return; }
    const twentyRaw = row[twentyIdx];
    const priceRaw = row[priceIdx];
    const key = norm(specStr) + "|" + norm(modelStr);
    merged.set(key, {
      spec: specStr, model: modelStr,
      twenty: (twentyRaw===null||twentyRaw===undefined||twentyRaw==="") ? null : Number(twentyRaw),
      sellPrice: (priceRaw===null||priceRaw===undefined||priceRaw==="") ? null : Number(priceRaw)
    });
  });

  const rowsToApply = Array.from(merged.values());
  statusEl.textContent = `偵測到賽輪總表，共 ${rowsToApply.length} 筆規格（已跳過備註含「下市」的 ${skippedCount} 筆），匯入中...`;

  let created = 0, updated = 0;
  let batch = db.batch();
  let opCount = 0;
  for(const r of rowsToApply){
    const existing = itemsCache.find(it=> norm(it.brand)===norm("賽輪Sailun") && norm(it.spec)===norm(r.spec) && norm(it.model)===norm(r.model));
    if(existing){
      batch.update(db.collection("items").doc(existing.id), { twenty: r.twenty, sellPrice: r.sellPrice });
      updated++;
    } else {
      const ref = db.collection("items").doc();
      batch.set(ref, { brand:"賽輪Sailun", model:r.model, spec:r.spec, remark:"", locations:{}, twenty:r.twenty, sellPrice:r.sellPrice });
      created++;
    }
    opCount++;
    if(opCount >= 400){ await batch.commit(); batch = db.batch(); opCount = 0; }
  }
  if(opCount > 0) await batch.commit();

  statusEl.textContent = `賽輪總表匯入完成！新增 ${created} 筆、更新20%／售價 ${updated} 筆（跳過備註含「下市」的 ${skippedCount} 筆）。`;
  return true;
}

// 偵測KYB報價單格式：支援新版（避震款式/廠牌/車型/年份代碼/料號/保修廠價/一線消費者售價）
// 跟舊版（車型/訂價/牌價/保修廠）兩種表頭，新版優先判斷。
function detectKybSheet(wb){
  for(const sheetName of wb.SheetNames){
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, blankrows:true});
    for(let r=0; r<Math.min(rows.length, 10); r++){
      const row = rows[r] || [];
      if(row.includes("車型") && row.includes("一線消費者售價")){
        return { rows, headerRowIndex: r, format: "new" };
      }
      if(row.includes("車型") && row.includes("訂價") && row.includes("牌價")){
        return { rows, headerRowIndex: r, format: "old" };
      }
    }
  }
  return null;
}

async function tryImportKybSheet(wb, statusEl){
  const detected = detectKybSheet(wb);
  if(!detected) return false;

  const header = detected.rows[detected.headerRowIndex];
  const modelIdx = header.indexOf("車型");
  const dataRows = detected.rows.slice(detected.headerRowIndex + 1);
  const merged = new Map();
  let skippedNoteCount = 0;
  const toNum = (v)=> (v===null||v===undefined||v==="") ? null : Number(v);

  if(detected.format === "new"){
    const bucketIdx = header.indexOf("避震款式");
    const makeIdx = header.indexOf("廠牌");
    const yearIdx = header.indexOf("年份代碼");
    const partIdx = header.indexOf("料號");
    const warrantyIdx = header.indexOf("保修廠價");
    const retailIdx = header.indexOf("一線消費者售價");
    const remarkIdx = header.indexOf("備註");

    dataRows.forEach(row=>{
      if(!row) return;
      const modelRaw = row[modelIdx];
      const modelStr = (modelRaw==null?"":modelRaw).toString().trim();
      if(!modelStr) return;
      if(modelStr.length > 60){ skippedNoteCount++; return; }
      const bucketType = bucketIdx>=0 ? (row[bucketIdx]||"").toString().trim() : "";
      const key = norm(modelStr) + "|" + bucketType;
      merged.set(key, {
        carModel: modelStr,
        bucketType,
        carMake: makeIdx>=0 ? (row[makeIdx]||"").toString().trim() : "",
        yearCode: yearIdx>=0 ? (row[yearIdx]==null?"":row[yearIdx].toString().trim()) : "",
        partNo: partIdx>=0 ? (row[partIdx]||"").toString().trim() : "",
        warrantyPrice: warrantyIdx>=0 ? toNum(row[warrantyIdx]) : null,
        catalogPrice: retailIdx>=0 ? toNum(row[retailIdx]) : null,
        remark: remarkIdx>=0 ? (row[remarkIdx]||"").toString().trim() : ""
      });
    });
  } else {
    const listIdx = header.indexOf("訂價");
    const catalogIdx = header.indexOf("牌價");
    const warrantyIdx = header.indexOf("保修廠");

    dataRows.forEach(row=>{
      if(!row) return;
      const modelRaw = row[modelIdx];
      const modelStr = (modelRaw==null?"":modelRaw).toString().trim();
      if(!modelStr) return;
      // 報價單常常在車型欄下方接一段免責聲明／注意事項文字（跟車型同一欄），
      // 車型名稱通常很短，這種備註文字明顯很長，用長度判斷跳過，避免被誤當成車型匯入。
      if(modelStr.length > 30){ skippedNoteCount++; return; }
      // 舊格式沒有避震款式欄位，一律視為白桶（沿用原本白桶車型的匯入方式）
      const key = norm(modelStr) + "|白桶";
      merged.set(key, {
        carModel: modelStr,
        bucketType: "白桶",
        carMake: "",
        yearCode: "",
        partNo: "",
        // 訂價欄位不再使用；牌價視同一線消費者售價
        catalogPrice: toNum(row[catalogIdx]) != null ? toNum(row[catalogIdx]) : toNum(row[listIdx]),
        warrantyPrice: warrantyIdx>=0 ? toNum(row[warrantyIdx]) : null,
        remark: ""
      });
    });
  }

  const rowsToApply = Array.from(merged.values());
  statusEl.textContent = `偵測到KYB報價單（${detected.format==='new'?'新版含桶色/廠牌/料號':'舊版'}），共 ${rowsToApply.length} 筆車型${skippedNoteCount?`（已跳過看起來像備註文字的 ${skippedNoteCount} 列）`:""}，匯入中...`;

  let created = 0, updated = 0;
  let batch = db.batch();
  let opCount = 0;
  for(const r of rowsToApply){
    const existing = kybItemsCache.find(it=> norm(it.carModel)===norm(r.carModel) && (it.bucketType||"")===r.bucketType);
    const payload = {
      carMake: r.carMake, bucketType: r.bucketType, yearCode: r.yearCode, partNo: r.partNo,
      catalogPrice: r.catalogPrice, warrantyPrice: r.warrantyPrice
    };
    if(r.remark) payload.remark = r.remark;
    if(existing){
      batch.update(db.collection("kybItems").doc(existing.id), payload);
      updated++;
    } else {
      const ref = db.collection("kybItems").doc();
      batch.set(ref, {
        carModel: r.carModel, brand: "KYB", remark: r.remark || "", locations: {},
        ...payload
      });
      created++;
    }
    opCount++;
    if(opCount >= 400){ await batch.commit(); batch = db.batch(); opCount = 0; }
  }
  if(opCount > 0) await batch.commit();

  statusEl.textContent = `KYB報價單匯入完成！新增 ${created} 筆車型、更新 ${updated} 筆${skippedNoteCount?`（已跳過看起來像備註文字的 ${skippedNoteCount} 列）`:""}。`;
  return true;
}

document.getElementById("kybClearDataBtn").addEventListener("click", async ()=>{
  if(!confirm("確定要清除所有「KYB車型」與「KYB儲位」資料嗎？（不會動到輪胎資料，也不會動到KYB的進出貨紀錄）這通常是為了重新匯入正確的資料才做，確定要繼續嗎？")) return;
  const statusEl = document.getElementById("kybImportStatus");
  statusEl.textContent = "清除中...";
  const itemsSnap = await db.collection("kybItems").get();
  const locSnap = await db.collection("kybLocations").get();
  const allDocs = [...itemsSnap.docs, ...locSnap.docs];
  let done = 0;
  while(done < allDocs.length){
    const batch = db.batch();
    allDocs.slice(done, done+400).forEach(d=>batch.delete(d.ref));
    await batch.commit();
    done += 400;
  }
  statusEl.textContent = `已清除 ${itemsSnap.size} 筆KYB車型與 ${locSnap.size} 筆儲位資料，可以重新選檔匯入了。`;
});

document.getElementById("kybImportBtn").addEventListener("click", async ()=>{
  const fileInput = document.getElementById("kybImportFile");
  const statusEl = document.getElementById("kybImportStatus");
  if(!fileInput.files.length){ alert("請先選擇檔案"); return; }
  statusEl.textContent = "讀取檔案中...";
  const file = fileInput.files[0];
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, {type:"array"});
  if(await tryImportKybSheet(wb, statusEl)) return;
  statusEl.textContent = "找不到可匯入的KYB報價單格式，請確認上傳的檔案含「車型」「一線消費者售價」欄位（或舊版的「車型」「訂價」「牌價」欄位）。";
});
