// ============================================================
// Firebase 連線設定
// 這個檔案是唯一需要在「交接」時替換的地方。
// 之後若要把整個系統移交給別人使用（例如朋友的公司），
// 只要把下面這一整段 firebaseConfig 換成他們自己 Firebase 專案的設定值即可，
// 其他程式檔案（app.js / index.html）完全不用動。
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyAdFY3r5clzlmttku5HmkQGyScMEfsJVWg",
  authDomain: "zheng-xiang-inventory-system.firebaseapp.com",
  projectId: "zheng-xiang-inventory-system",
  storageBucket: "zheng-xiang-inventory-system.firebasestorage.app",
  messagingSenderId: "827937435977",
  appId: "1:827937435977:web:9f34e3bd7811f161c6aa98",
  measurementId: "G-X4X225X3WK"
};

// 帳號登入用的內部網域（因為員工登入只需要輸入簡單帳號名稱，不需要 email 格式，
// 系統會在背後自動組合成 帳號名稱@這個網域 餵給 Firebase Authentication）
const INTERNAL_EMAIL_DOMAIN = "zhengxiang-inventory.local";

// 初始化 Firebase（使用 CDN 的 compat 版本 SDK，見 index.html 引入方式）
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// 用來建立新使用者時，避免影響目前登入中的管理者帳號（Firebase 用戶端 SDK 的已知限制：
// 建立新帳號時會自動切換登入身份成新帳號，所以另外開一個「次要」App 實例，
// 專門拿來建立帳號，不會動到目前主畫面的登入狀態）
const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();
