// ============================================================
// 銷售計價共用模組
// 輪胎、KYB、叫貨、直接銷貨與 ERP 都共用這裡的稅額計算；
// 未來調整稅率或新增價目表時，只需修改本檔。
// ============================================================

const SALES_TAX_RATE = 0.05;
const SALES_DEFAULT_PRICE_KEY = {
  tire: "sellPrice",
  kyb: "catalogPrice"
};
const SALES_TAX_MODES = [
  { key:"no_tax", label:"不計稅" },
  { key:"tax_included", label:"稅內含（5%）" },
  { key:"tax_excluded", label:"稅外加（5%）" }
];

function salesPricingNumber(value){
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
function salesPricingMoney(value){
  return Math.round(salesPricingNumber(value)).toLocaleString("zh-TW");
}
function salesPricingTemplates(source){
  return Array.isArray(PRICE_TEMPLATES && PRICE_TEMPLATES[source]) ? PRICE_TEMPLATES[source] : [];
}
function salesPricingTaxMode(mode){
  return SALES_TAX_MODES.some(entry => entry.key === mode) ? mode : "no_tax";
}
function salesPricingItemPrice(item, key){
  if(!item || !key) return null;
  const value = Number(item[key]);
  return Number.isFinite(value) && value > 0 ? value : null;
}
function salesPricingDefaultKey(source, item){
  const templates = salesPricingTemplates(source);
  const preferred = SALES_DEFAULT_PRICE_KEY[source];
  if(templates.some(entry => entry.key === preferred) && salesPricingItemPrice(item, preferred) != null) return preferred;
  const available = templates.find(entry => salesPricingItemPrice(item, entry.key) != null);
  return available ? available.key : (templates[0] ? templates[0].key : "");
}

// 唯一的稅額計算來源。lineAmount 用於 ERP 多品項加總；其他情境使用數量 × 單價。
function salesPricingTotals(data = {}){
  const rawAmount = data.lineAmount != null
    ? salesPricingNumber(data.lineAmount)
    : salesPricingNumber(data.quantity) * salesPricingNumber(data.unitPrice);
  const lineAmount = Math.round(Math.max(0, rawAmount));
  const taxMode = salesPricingTaxMode(data.taxMode);
  if(taxMode === "tax_excluded"){
    const subtotal = lineAmount;
    const taxAmount = Math.round(subtotal * SALES_TAX_RATE);
    return { lineAmount, subtotal, taxAmount, totalAmount:subtotal + taxAmount, taxRate:SALES_TAX_RATE, taxMode };
  }
  if(taxMode === "tax_included"){
    const totalAmount = lineAmount;
    const subtotal = Math.round(totalAmount / (1 + SALES_TAX_RATE));
    return { lineAmount, subtotal, taxAmount:totalAmount - subtotal, totalAmount, taxRate:SALES_TAX_RATE, taxMode };
  }
  return { lineAmount, subtotal:lineAmount, taxAmount:0, totalAmount:lineAmount, taxRate:0, taxMode };
}

function salesPricingStoredFields(data = {}, quantity){
  const taxMode = salesPricingTaxMode(data.taxMode);
  const unitPrice = Math.max(0, salesPricingNumber(data.unitPrice));
  const totals = salesPricingTotals({ quantity:quantity != null ? quantity : data.quantity, unitPrice, taxMode });
  const templates = salesPricingTemplates(data.itemSource || data.source || "");
  const key = templates.some(entry => entry.key === data.priceListKey) ? data.priceListKey : (data.priceListKey || "");
  const matched = templates.find(entry => entry.key === key);
  return {
    priceListKey:key,
    priceListLabel:data.priceListLabel || (matched ? matched.label : ""),
    unitPrice,
    taxMode,
    lineAmount:totals.lineAmount,
    subtotalAmount:totals.subtotal,
    taxAmount:totals.taxAmount,
    totalAmount:totals.totalAmount,
    taxRate:totals.taxRate
  };
}

function salesPricingHtml(prefix, source){
  const taxOptions = SALES_TAX_MODES.map(entry => '<option value="' + entry.key + '">' + entry.label + '</option>').join("");
  return '<section class="sales-pricing-box" id="' + prefix + 'Box" data-sales-source="' + source + '">'
    + '<div class="sales-pricing-title">銷售金額與稅別</div>'
    + '<div class="form-row"><label>套用價目表</label><select id="' + prefix + 'PriceList"><option value="">請先選擇品項</option></select></div>'
    + '<div class="form-row"><label>單價</label><input type="number" min="0" step="1" inputmode="numeric" id="' + prefix + 'UnitPrice" placeholder="請輸入實際成交單價"></div>'
    + '<div class="form-row"><label>稅別</label><select id="' + prefix + 'TaxMode">' + taxOptions + '</select></div>'
    + '<div class="sales-pricing-summary" id="' + prefix + 'Summary"></div>'
    + '</section>';
}

function salesPricingSetItem(prefix, source, item, existing = null){
  const list = document.getElementById(prefix + "PriceList");
  const input = document.getElementById(prefix + "UnitPrice");
  const tax = document.getElementById(prefix + "TaxMode");
  if(!list || !input || !tax) return;
  const templates = salesPricingTemplates(source);
  if(!item){
    list.innerHTML = '<option value="">請先選擇品項</option>';
    list.disabled = true;
    input.value = "";
    input.disabled = true;
    salesPricingRefresh(prefix, 0);
    return;
  }
  list.disabled = false;
  input.disabled = false;
  const validExistingKey = existing && templates.some(entry => entry.key === existing.priceListKey) ? existing.priceListKey : "";
  const currentKey = templates.some(entry => entry.key === list.value) ? list.value : "";
  const key = validExistingKey || currentKey || salesPricingDefaultKey(source, item);
  list.innerHTML = templates.map(entry => '<option value="' + entry.key + '"' + (entry.key === key ? ' selected' : '') + '>' + entry.label + '</option>').join("");
  const savedPrice = existing && Number(existing.unitPrice) > 0 ? Number(existing.unitPrice) : null;
  const defaultPrice = salesPricingItemPrice(item, key);
  input.value = savedPrice != null ? String(savedPrice) : (defaultPrice != null ? String(defaultPrice) : "");
  tax.value = salesPricingTaxMode(existing && existing.taxMode);
  salesPricingRefresh(prefix);
}

function salesPricingRefresh(prefix, quantity){
  const input = document.getElementById(prefix + "UnitPrice");
  const tax = document.getElementById(prefix + "TaxMode");
  const summary = document.getElementById(prefix + "Summary");
  if(!input || !tax || !summary) return;
  const qty = quantity != null ? quantity : salesPricingNumber(input.dataset.quantity || 0);
  const hasPrice = String(input.value || "").trim() !== "" && salesPricingNumber(input.value) > 0;
  if(!hasPrice){
    summary.innerHTML = '<span>請輸入單價後，即時計算未稅、營業稅與含稅總計。</span>';
    return;
  }
  const totals = salesPricingTotals({ quantity:qty, unitPrice:input.value, taxMode:tax.value });
  summary.innerHTML = '<div><span>未稅</span><strong>NT$ ' + salesPricingMoney(totals.subtotal) + '</strong></div>'
    + '<div><span>營業稅 ' + (totals.taxRate ? '5%' : '0%') + '</span><strong>NT$ ' + salesPricingMoney(totals.taxAmount) + '</strong></div>'
    + '<div class="sales-pricing-total"><span>含稅總計</span><strong>NT$ ' + salesPricingMoney(totals.totalAmount) + '</strong></div>';
}

function bindSalesPricing(prefix, source, getItem, getQuantity, existing = null, quantityInputId = ""){
  const list = document.getElementById(prefix + "PriceList");
  const input = document.getElementById(prefix + "UnitPrice");
  const tax = document.getElementById(prefix + "TaxMode");
  const refresh = () => {
    const qty = Math.max(0, salesPricingNumber(getQuantity ? getQuantity() : 0));
    if(input) input.dataset.quantity = String(qty);
    salesPricingRefresh(prefix, qty);
  };
  const setItem = (item, saved = null) => {
    salesPricingSetItem(prefix, source, item, saved);
    refresh();
  };
  if(!list || !input || !tax) return { refresh, setItem };
  list.addEventListener("change", () => {
    const item = getItem ? getItem() : null;
    const price = salesPricingItemPrice(item, list.value);
    input.value = price != null ? String(price) : "";
    refresh();
  });
  input.addEventListener("input", refresh);
  tax.addEventListener("change", refresh);
  const qtyElement = document.getElementById(quantityInputId || (prefix + "Quantity"));
  if(qtyElement){
    qtyElement.addEventListener("input", refresh);
    qtyElement.addEventListener("change", refresh);
  }
  setItem(getItem ? getItem() : null, existing);
  return { refresh, setItem };
}

function readSalesPricing(prefix, quantity){
  const list = document.getElementById(prefix + "PriceList");
  const input = document.getElementById(prefix + "UnitPrice");
  const tax = document.getElementById(prefix + "TaxMode");
  if(!list || !input || !tax) throw new Error("找不到銷售金額欄位，請重新開啟表單");
  if(String(input.value || "").trim() === "" || salesPricingNumber(input.value) <= 0) throw new Error("請輸入大於 0 的實際成交單價");
  const templates = salesPricingTemplates(document.getElementById(prefix + "Box").dataset.salesSource);
  const priceList = templates.find(entry => entry.key === list.value);
  const fields = salesPricingStoredFields({
    itemSource:document.getElementById(prefix + "Box").dataset.salesSource,
    priceListKey:priceList ? priceList.key : "",
    priceListLabel:priceList ? priceList.label : "",
    unitPrice:input.value,
    taxMode:tax.value
  }, quantity);
  return fields;
}
