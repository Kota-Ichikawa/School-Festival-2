import "./styles.css";
import { useState, useEffect, useRef } from "react";

import { useReducer } from "react";
import { Header } from "./components/Header";
import { Title } from "./components/Title";
import { Menu } from "./components/Menu";
import { Order } from "./components/Order";
import { Footer } from "./components/Footer";
import { TimeSelect } from "./components/TimeSelect";
import { loadSquareSdk } from "./squarePayments";
import { Api } from "./api";
import {
  buildOrderItems,
  formatReservedTimeHHmm,
  parseReservedToDate,
} from "./orderUtils";
import {
  setCookieJSON,
  getCookieJSON,
  setCookieStr,
  getCookieStr,
  deleteCookie,
} from "./cookies";

import testImg from "../src/image/testImg.jpg";

// ------ 変数や定数 ------

const steps = [
  "title",
  "menu",
  "drink",
  "cart",
  "time",
  "payment",
  "paymentResult",
  "numberTag",
];

// 値段
const prices = {
  10: 420,
  20: 620,
  30: 150,
  40: 520,
  50: 720,
};

const itemNames = {
  10: "角煮 単品",
  20: "角煮大盛り 単品",
  30: "ドリンク 単品",
  40: "【お得】角煮ドリンクセット",
  50: "【お得】角煮ドリンクセット大盛り",
  91: "コーラ",
  92: "オレンジジュース",
  93: "三ツ矢サイダー",
  94: "烏龍茶",
};

const initialState = {
  step: "title",
  cart: {
    91: 0,
    92: 0,
    93: 0,
    94: 0,
    30: 0,
    40: 0,
    50: 0,
    10: 0,
    20: 0,
    31: 0,
    32: 0,
    33: 0,
    34: 0,
    41: 0,
    42: 0,
    43: 0,
    44: 0,
    51: 0,
    52: 0,
    53: 0,
    54: 0,
  },
};

const testDate = new Date(2025, 8, 22, 12, 0, 0);

// ------ reducer ------
const screenState = (state, action) => {
  switch (action.type) {
    case "GOTO":
      if (!steps.includes(action.step)) return state;
      return { ...state, step: action.step };
    case "NEXT": {
      const currentIndex = steps.indexOf(state.step);
      if (currentIndex === -1) return state;
      if (currentIndex < steps.length - 1) {
        const nextStep = steps[currentIndex + 1];
        return { ...state, step: nextStep };
      }
      return state;
    }
    case "PREV": {
      const currentIndex = steps.indexOf(state.step);
      if (currentIndex === -1) return state;
      if (currentIndex > 0) {
        const prevStep = steps[currentIndex - 1];
        return { ...state, step: prevStep };
      }
      return state;
    }
    case "ADD_ITEM": {
      const { itemId } = action;
      const currentCount = state.cart[itemId] || 0;
      return { ...state, cart: { ...state.cart, [itemId]: currentCount + 1 } };
    }
    case "REMOVE_ITEM": {
      const { itemId } = action;
      const currentCount = state.cart[itemId] || 0;
      if (currentCount > 0) {
        return {
          ...state,
          cart: { ...state.cart, [itemId]: currentCount - 1 },
        };
      }
      return state;
    }
    case "CLEAR_TEMPORARY_DRINKS": {
      const newCart = { ...state.cart };
      newCart[91] = 0;
      newCart[92] = 0;
      newCart[93] = 0;
      newCart[94] = 0;
      return { ...state, cart: newCart };
    }
    case "DELETE_TEMPORARY": {
      const newCart = { ...state.cart };
      newCart[30] = 0;
      newCart[40] = 0;
      newCart[50] = 0;
      return { ...state, cart: newCart };
    }
    case "ORGANIZE_CART": {
      const cart = state.cart;
      const newCart = { ...cart };
      let sumM = newCart[40] || 0;
      let sumL = newCart[50] || 0;

      for (let i = 31; i <= 34; i++) newCart[i] = 0;
      for (let i = 41; i <= 44; i++) newCart[i] = 0;
      for (let i = 51; i <= 54; i++) newCart[i] = 0;

      for (let d = 91; d <= 94; d++) {
        const drinkNo = d - 90;
        let qty = newCart[d] || 0;
        const takeM = Math.min(qty, sumM);
        if (takeM > 0) {
          const target = 40 + drinkNo;
          newCart[target] = (newCart[target] || 0) + takeM;
          sumM -= takeM;
          qty -= takeM;
        }
        const takeL = Math.min(qty, sumL);
        if (takeL > 0) {
          const target = 50 + drinkNo;
          newCart[target] = (newCart[target] || 0) + takeL;
          sumL -= takeL;
          qty -= takeL;
        }
        if (qty > 0) {
          const target = 30 + drinkNo;
          newCart[target] = (newCart[target] || 0) + qty;
          qty = 0;
        }
      }
      return { ...state, cart: newCart };
    }
    case "REPLACE_CART":
      return { ...state, cart: { ...state.cart, ...action.cart } };
    default:
      return state;
  }
};

// ------ 本体 ------

export const App = () => {
  // NOTE: To actually run tokenize/createOrder set this to false.
  // For safe development leave it true. You control whether real tokenization/charge runs.
  const USE_MOCK_PAYMENT = false;

  const [selectedTime, setSelectedTime] = useState(null);
  const [state, dispatch] = useReducer(screenState, initialState);

  const [paymentPhase, setPaymentPhase] = useState("connecting");
  const paymentTimerRef = useRef(null);

  const [paymentOutcome, setPaymentOutcome] = useState({
    ok: false,
    orderId: null,
    error: null,
    receiptUrl: null,
  });

  const goto = (s) => dispatch({ type: "GOTO", step: s });
  const next = () => {
    if (state.step === "menu" && calculateNumberOfDrinksInMenu() === 0) {
      dispatch({ type: "GOTO", step: "cart" });
    } else if (state.step === "drink") {
      dispatch({ type: "ORGANIZE_CART" });
      dispatch({ type: "NEXT" });
    } else {
      dispatch({ type: "NEXT" });
    }
  };
  const prev = () => {
    if (state.step === "cart") {
      dispatch({ type: "CLEAR_TEMPORARY_DRINKS" });
      dispatch({ type: "GOTO", step: "menu" });
    } else {
      dispatch({ type: "PREV" });
    }
  };
  const addItems = (id) => dispatch({ type: "ADD_ITEM", itemId: id });
  const removeItems = (id) => dispatch({ type: "REMOVE_ITEM", itemId: id });

  const calculateNumberOfDrinksInMenu = () =>
    state.cart[30] + state.cart[40] + state.cart[50];
  const calculateNumberOfDrinksInDrink = () =>
    state.cart[91] + state.cart[92] + state.cart[93] + state.cart[94];
  const calculateDifferenceOfDrinks = () =>
    calculateNumberOfDrinksInMenu() - calculateNumberOfDrinksInDrink();
  const calculateSumInMenu = () =>
    state.cart[10] +
    state.cart[20] +
    state.cart[30] +
    state.cart[40] +
    state.cart[50];
  const calculateSumPrice = () =>
    prices[10] * state.cart[10] +
    prices[20] * state.cart[20] +
    prices[30] * state.cart[30] +
    prices[40] * state.cart[40] +
    prices[50] * state.cart[50];

  // Square Card のインスタンス保持
  const cardRef = useRef(null);
  const [cardAttached, setCardAttached] = useState(false);

  // billing inputs: surname, given name, email
  const [billingFamilyName, setBillingFamilyName] = useState("");
  const [billingGivenName, setBillingGivenName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingCountryCode, setBillingCountryCode] = useState("JP");

  function clearCardContainer() {
    const el = document.getElementById("card-container");
    if (el) el.innerHTML = "";
  }

  async function destroyCardIfAny() {
    try {
      if (cardRef.current && typeof cardRef.current.destroy === "function") {
        await cardRef.current.destroy();
      }
    } catch (_) {
      // ignore
    } finally {
      cardRef.current = null;
      clearCardContainer();
      setCardAttached(false);
      console.log(
        "DEBUG: destroyCardIfAny: cleared cardRef and cardAttached=false"
      );
    }
  }

  function pTimeout(promise, ms, msg = "attach timeout") {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(msg)), ms);
      promise
        .then((v) => {
          clearTimeout(t);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(t);
          reject(e);
        });
    });
  }

  async function ensureCardMounted(applicationId, locationId) {
    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    async function waitForContainer() {
      for (let i = 0; i < 3; i++) {
        const el = document.getElementById("card-container");
        if (el) return el;
        await nextFrame();
      }
      console.error("DEBUG: waitForContainer timed out");
      return null;
    }

    if (!window.Square) throw new Error("Square SDKが読み込まれていません");
    const container = await waitForContainer();
    if (!container) throw new Error("#card-container が見つかりません");

    if (cardRef.current) {
      if (container.childElementCount === 0) {
        try {
          console.log("DEBUG: trying re-attach...");
          await pTimeout(
            cardRef.current.attach("#card-container"),
            5000,
            "カードUIの attach がタイムアウトしました"
          );
          setCardAttached(true);
          console.log("DEBUG: re-attach succeeded — cardAttached=true");
          return;
        } catch (err) {
          console.warn("DEBUG: re-attach failed, will recreate", err);
          await destroyCardIfAny();
        }
      } else {
        setCardAttached(true);
        console.log("DEBUG: already attached in DOM — cardAttached=true");
        return;
      }
    }

    let payments;
    try {
      payments = window.Square.payments(applicationId, locationId);
    } catch (e) {
      throw new Error(
        "Square.payments init failed: " +
          (e?.message || "") +
          "\n→ Add " +
          window.location.origin +
          " to Allowed origins in Developer Console"
      );
    }

    const card = await payments.card();
    await pTimeout(
      card.attach("#card-container"),
      5000,
      "カードUIの attach がタイムアウトしました"
    );
    cardRef.current = card;
    setCardAttached(true);
    console.log("DEBUG: created and attached card — cardAttached=true");
  }

  useEffect(() => {
    if (state.step !== "payment") return;

    setPaymentPhase("connecting");
    if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    destroyCardIfAny();

    paymentTimerRef.current = setTimeout(async () => {
      try {
        const cfg = await Api.getSquareConfig();
        console.log("DEBUG: getSquareConfig raw:", cfg);
        const applicationId = (cfg?.applicationId ?? "").toString().trim();
        const locationId = (cfg?.locationId ?? "").toString().trim();
        console.log("DEBUG: applicationId (trimmed):", applicationId);
        console.log("DEBUG: locationId (trimmed):", locationId);

        await loadSquareSdk(cfg?.environment || "PRODUCTION");
        setPaymentPhase("input");
      } catch (e) {
        alert(e?.message || "決済モジュールの初期化に失敗しました");
        dispatch({ type: "GOTO", step: "cart" });
      }
    }, 1000);

    return () => {
      if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
      destroyCardIfAny();
    };
  }, [state.step]);

  useEffect(() => {
    if (state.step !== "payment") return;
    if (paymentPhase !== "input") return;

    const attachTimer = setTimeout(() => {
      (async () => {
        try {
          const cfg = await Api.getSquareConfig();
          await ensureCardMounted(cfg.applicationId, cfg.locationId);
        } catch (e) {
          alert(e?.message || "#card-container の初期化に失敗しました");
          dispatch({ type: "GOTO", step: "cart" });
        }
      })();
    }, 100);

    return () => {
      clearTimeout(attachTimer);
    };
  }, [state.step, paymentPhase]);

  const canUseCookies = async () => {
    try {
      const key = "__cm_cookie_test";
      setCookieStr(key, "1", { minutes: 1 });
      const v = getCookieStr(key);
      deleteCookie(key);
      return v === "1";
    } catch {
      return false;
    }
  };

  function buildVerificationDetails(amountYen, billingContact) {
    const base = {
      amount: String(amountYen),
      currencyCode: "JPY",
      intent: "CHARGE",
      customerInitiated: true,
      sellerKeyedIn: false,
    };
    if (billingContact && typeof billingContact === "object")
      base.billingContact = billingContact;
    else base.billingContact = { countryCode: "JP" };
    return base;
  }

  const handleSubmitOrderFlow = async () => {
    if (!(await canUseCookies()))
      throw new Error("このブラウザではCookieが使えません。");

    const items = buildOrderItems(state.cart);
    const amount = calculateSumPrice();
    console.log("DEBUG: buildOrderItems result:", items);
    console.log("DEBUG: state.cart:", state.cart);
    console.log("DEBUG: calculated amount:", amount);
    console.table(items);
    if (items.length === 0) throw new Error("カートが空です");

    const reservedDate = parseReservedToDate(selectedTime);
    if (!reservedDate) throw new Error("予約時刻が不正です");

    const reservedAtIso = reservedDate.toISOString();
    const createdAtIso = new Date().toISOString();

    const cfg = await Api.getSquareConfig();
    const applicationId = cfg?.applicationId;
    const locationId = cfg?.locationId;
    if (!applicationId || !locationId)
      throw new Error("Square設定が不足しています。");

    try {
      if (!cardRef.current) {
        const cfg2 = await Api.getSquareConfig();
        await ensureCardMounted(cfg2.applicationId, cfg2.locationId);
        if (!cardRef.current) throw new Error("カードUIの初期化に失敗しました");
      }
      console.log("DEBUG: Card UI attached:", !!cardRef.current);

      // billingContact 作成（入力欄から）
      const billingContact = {
        familyName: billingFamilyName.trim() || "",
        givenName: billingGivenName.trim() || "",
        email: billingEmail.trim() || "",
        countryCode: billingCountryCode || "JP",
      };
      console.log("DEBUG: billingContact prepared:", billingContact);

      // tokenization / トークン取得
      console.log("DEBUG: USE_MOCK_PAYMENT =", USE_MOCK_PAYMENT);
      let sourceId = null;

      if (USE_MOCK_PAYMENT) {
        // Mockモード: トークン化しない（安全）
        console.log(
          "DEBUG: MOCK payment active — skipping tokenize and backend charge"
        );
        sourceId = "MOCK-SOURCE-" + Math.floor(Math.random() * 100000);
      } else {
        console.log("DEBUG: calling tokenize with verificationDetails...");
        const verificationDetails = buildVerificationDetails(
          amount,
          billingContact
        );
        console.log("DEBUG: verificationDetails:", verificationDetails);

        const result = await cardRef.current.tokenize(verificationDetails);
        console.log("DEBUG: tokenize result:", result);
        // result の中身を詳しく出す（token, status, errors）
        console.log("DEBUG: tokenize token:", result?.token);
        console.log("DEBUG: tokenize status:", result?.status);
        console.log("DEBUG: tokenize errors:", result?.errors);

        if (result.status !== "OK") {
          const msg =
            result.errors?.[0]?.message || "カードのトークン化に失敗しました";
          throw new Error(msg);
        }
        sourceId = result.token;
      }

      // 注文作成 & 決済（実行するかは USE_MOCK_PAYMENT に依存）
      let orderId, payment;
      if (USE_MOCK_PAYMENT) {
        orderId = "MOCK-" + Math.floor(Math.random() * 100000);
        await new Promise((r) => setTimeout(r, 300));
        payment = { status: "APPROVED", receiptUrl: "" };
        console.log("DEBUG: returning mock payment", { orderId, payment });
      } else {
        console.log("DEBUG: calling Api.createOrder with items, amount:", {
          items,
          amount,
        });
        const order = await Api.createOrder({
          items,
          reservedAtIso,
          createdAtIso,
          amount,
        });
        console.log("DEBUG: createOrder response:", order);
        orderId = order?.orderId;
        if (!orderId) throw new Error("orderIdの発行に失敗しました");

        console.log("DEBUG: calling Api.chargeOrder with sourceId:", sourceId);
        payment = await Api.chargeOrder({
          orderId,
          sourceId,
          items,
          reservedAtIso,
          createdAtIso,
          amount,
        });
        console.log("DEBUG: chargeOrder response:", payment);
      }

      if (payment?.status === "APPROVED") {
        setCookieJSON(
          "cm_order_v1",
          {
            createdAt: createdAtIso,
            reservedAtIso,
            orderId,
            itemsCart: state.cart,
          },
          { days: 7 }
        );

        setPaymentOutcome({
          ok: true,
          orderId,
          error: null,
          receiptUrl: payment?.receiptUrl || null,
        });
      } else {
        setPaymentOutcome({
          ok: false,
          orderId,
          error: payment?.error || "決済が承認されませんでした",
          receiptUrl: null,
        });
      }
    } catch (e) {
      console.error("ERROR in handleSubmitOrderFlow:", e);
      setPaymentOutcome({
        ok: false,
        orderId: null,
        error: e?.message || "決済処理中にエラーが発生しました",
        receiptUrl: null,
      });
    }
    dispatch({ type: "GOTO", step: "paymentResult" });
  };

  // ------ return (省略せず支払いUIに入力欄とボタン) ------
  return (
    <>
      <header>
        <Header />
        <div style={{ minHeight: "10px" }} />
      </header>

      {state.step === "title" && <Title onStart={next} />}

      {state.step === "menu" && (
        <>
          <div className="center-alignment">
            <div className="list-row">
              <Menu
                borderColor={"2px solid #ffbf7f"}
                backgroundColor={"#ffd3a8"}
                itemPrice={`¥${prices[40]}`}
                itemName={itemNames[40]}
                count={state.cart[40]}
                id={40}
                add={addItems}
                remove={removeItems}
                image={testImg}
                isSoldout={false}
              />
              <Menu
                borderColor={"2px solid #ffbf7f"}
                backgroundColor={"#ffd3a8"}
                itemPrice={`¥${prices[50]}`}
                itemName={itemNames[50]}
                count={state.cart[50]}
                id={50}
                add={addItems}
                remove={removeItems}
                isSoldout={false}
              />
            </div>
            <div className="list-row">
              <Menu
                borderColor={"2px solid #ffbf7f"}
                backgroundColor={"#ffd3a8"}
                itemPrice={`¥${prices[10]}`}
                itemName={itemNames[10]}
                count={state.cart[10]}
                id={10}
                add={addItems}
                remove={removeItems}
                isSoldout={false}
              />
              <Menu
                borderColor={"2px solid #ffbf7f"}
                backgroundColor={"#ffd3a8"}
                itemPrice={`¥${prices[20]}`}
                itemName={itemNames[20]}
                count={state.cart[20]}
                id={20}
                add={addItems}
                remove={removeItems}
                isSoldout={false}
              />
            </div>
            <div className="list-row">
              <Menu
                borderColor={"2px solid #ffbf7f"}
                backgroundColor={"#ffd3a8"}
                itemPrice={`¥${prices[30]}`}
                itemName={itemNames[30]}
                count={state.cart[30]}
                id={30}
                add={addItems}
                remove={removeItems}
                isSoldout={false}
              />
            </div>
          </div>
          <div style={{ minHeight: "60px" }} />
        </>
      )}

      {state.step === "drink" && (
        <>
          <p style={{ textAlign: "center", fontSize: 22, margin: "10px auto" }}>
            飲み物を選択してください
          </p>
          {calculateDifferenceOfDrinks() > 0 ? (
            <p
              style={{
                textAlign: "center",
                fontSize: 30,
                fontWeight: "bold",
                margin: "10px auto",
                backgroundColor: "#9eceff",
              }}
            >
              {`あと ${calculateDifferenceOfDrinks()} 個`}
            </p>
          ) : (
            <p
              style={{
                textAlign: "center",
                fontSize: 30,
                fontWeight: "bold",
                margin: "10px auto",
                backgroundColor: "#9eceff",
              }}
            >
              OK！
            </p>
          )}
          <div className="center-alignment">
            <div className="list-row">
              <Menu
                borderColor={"2px solid #7fbfff"}
                backgroundColor={"#a8d3ff"}
                itemName={itemNames[91]}
                count={state.cart[91]}
                id={91}
                add={addItems}
                remove={removeItems}
                difference={calculateDifferenceOfDrinks()}
                isDrinkScreen={true}
                isSoldout={false}
              />
              <Menu
                borderColor={"2px solid #7fbfff"}
                backgroundColor={"#a8d3ff"}
                itemName={itemNames[92]}
                count={state.cart[92]}
                id={92}
                add={addItems}
                remove={removeItems}
                difference={calculateDifferenceOfDrinks()}
                isDrinkScreen={true}
                isSoldout={false}
              />
            </div>
            <div className="list-row">
              <Menu
                borderColor={"2px solid #7fbfff"}
                backgroundColor={"#a8d3ff"}
                itemName={itemNames[93]}
                count={state.cart[93]}
                id={93}
                add={addItems}
                remove={removeItems}
                difference={calculateDifferenceOfDrinks()}
                isDrinkScreen={true}
                isSoldout={false}
              />
              <Menu
                borderColor={"2px solid #7fbfff"}
                backgroundColor={"#a8d3ff"}
                itemName={itemNames[94]}
                count={state.cart[94]}
                id={94}
                add={addItems}
                remove={removeItems}
                difference={calculateDifferenceOfDrinks()}
                isDrinkScreen={true}
                isSoldout={false}
              />
            </div>
          </div>
          <div style={{ minHeight: "60px" }} />
        </>
      )}

      {state.step === "cart" && (
        <>
          <p
            style={{
              textAlign: "center",
              fontSize: 22,
              fontWeight: "bold",
              margin: "16px auto",
            }}
          >
            ご注文内容の確認
          </p>
          <div>
            <Order cart={state.cart} price={prices} names={itemNames} />
            <div style={{ minHeight: "60px" }} />
          </div>
        </>
      )}

      {state.step === "time" && (
        <div className="reservation-page-wrapper">
          <TimeSelect onTimeChange={setSelectedTime} testTime={testDate} />
        </div>
      )}

      {state.step === "payment" && (
        <>
          {paymentPhase === "connecting" && (
            <p style={{ marginLeft: "10px" }}>外部決済サービスに接続中...</p>
          )}
          {paymentPhase === "input" && (
            <div style={{ padding: "12px 10px" }}>
              <p style={{ margin: "6px 10px" }}>カード情報の入力</p>

              {/* billing fields */}
              <div style={{ margin: "6px 10px", marginBottom: 12 }}>
                <input
                  placeholder="苗字 (例: 山田)"
                  value={billingFamilyName}
                  onChange={(e) => setBillingFamilyName(e.target.value)}
                  style={{ width: "32%", marginRight: 6 }}
                />
                <input
                  placeholder="名前 (例: 太郎)"
                  value={billingGivenName}
                  onChange={(e) => setBillingGivenName(e.target.value)}
                  style={{ width: "32%", marginRight: 6 }}
                />
                <input
                  placeholder="メールアドレス (例: taro@example.com)"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  style={{ width: "34%" }}
                />
                <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                  ※3DS（本人認証）用に氏名とメールが必要になる場合があります
                </div>
              </div>

              <div id="card-container" style={{ margin: "12px 10px" }} />
              <button
                style={{ marginLeft: 10, width: 160, height: 32, fontSize: 14 }}
                disabled={
                  !cardAttached ||
                  !billingFamilyName.trim() ||
                  !billingGivenName.trim() ||
                  !billingEmail.trim()
                }
                onClick={async () => {
                  try {
                    await handleSubmitOrderFlow();
                  } catch (e) {
                    alert(e?.message || "決済でエラーが発生しました");
                  }
                }}
              >
                {cardAttached &&
                billingFamilyName.trim() &&
                billingGivenName.trim() &&
                billingEmail.trim()
                  ? "支払う"
                  : "準備中..."}
              </button>
            </div>
          )}
        </>
      )}

      {state.step === "paymentResult" && (
        <>
          {paymentOutcome.ok ? (
            <div style={{ padding: "12px" }}>
              <p
                style={{
                  textAlign: "center",
                  fontSize: 22,
                  fontWeight: "bold",
                  margin: "16px auto",
                }}
              >
                決済が完了しました
              </p>
              <p style={{ textAlign: "center", fontSize: 18, margin: "6px" }}>
                注文番号：<b>{paymentOutcome.orderId}</b>
              </p>
              {paymentOutcome.receiptUrl && (
                <p style={{ textAlign: "center", margin: "6px" }}>
                  <a
                    href={paymentOutcome.receiptUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    レシートを開く
                  </a>
                </p>
              )}
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  style={{ width: 160, height: 44, fontSize: 18 }}
                  onClick={() => dispatch({ type: "GOTO", step: "numberTag" })}
                >
                  番号札を表示
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: "12px" }}>
              <p
                style={{
                  textAlign: "center",
                  fontSize: 22,
                  fontWeight: "bold",
                  margin: "16px auto",
                  color: "red",
                }}
              >
                決済に失敗しました
              </p>
              {paymentOutcome.orderId && (
                <p style={{ textAlign: "center", fontSize: 16, margin: "6px" }}>
                  （注文番号: {paymentOutcome.orderId}）
                </p>
              )}
              <p style={{ textAlign: "center", fontSize: 16, margin: "6px" }}>
                {paymentOutcome.error || "不明なエラー"}
              </p>
              <div style={{ textAlign: "center", marginTop: 16 }}>
                <button
                  style={{
                    width: 160,
                    height: 44,
                    fontSize: 18,
                    marginRight: 10,
                  }}
                  onClick={() => {
                    setPaymentOutcome({
                      ok: false,
                      orderId: null,
                      error: null,
                      receiptUrl: null,
                    });
                    dispatch({ type: "GOTO", step: "cart" });
                  }}
                >
                  カートに戻る
                </button>
                <button
                  style={{ width: 160, height: 44, fontSize: 18 }}
                  onClick={() => {
                    setPaymentOutcome({
                      ok: false,
                      orderId: null,
                      error: null,
                      receiptUrl: null,
                    });
                    dispatch({ type: "GOTO", step: "payment" });
                  }}
                >
                  再試行
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {state.step === "numberTag" && (
        <>
          <p
            style={{
              textAlign: "center",
              fontSize: 22,
              fontWeight: "bold",
              margin: "16px auto",
            }}
          >
            ご注文ありがとうございます！
          </p>
          <p
            style={{
              textAlign: "center",
              fontSize: 20,
              margin: "16px 0px 2px 0px",
            }}
          >
            注文番号
          </p>
          <p
            style={{
              textAlign: "center",
              fontSize: 60,
              fontWeight: "bold",
              margin: "2px",
            }}
          >
            NNNNN
          </p>
          <Order cart={state.cart} price={prices} names={itemNames} />
        </>
      )}

      {state.step !== "payment" &&
        state.step !== "paymentResult" &&
        state.step !== "complete" &&
        state.step !== "title" &&
        state.step !== "numberTag" && (
          <footer>
            <Footer
              sumPrice={calculateSumPrice()}
              prev={prev}
              next={next}
              goto={goto}
              currentStep={state.step}
              numOfChosenMenu={calculateSumInMenu()}
              numOfOrderedDrinks={calculateNumberOfDrinksInMenu()}
              difference={calculateDifferenceOfDrinks()}
            />
          </footer>
        )}
    </>
  );
};

//ThisAppMadeBy
//Mika.Misono, Seia.Yurizono, Nagisa.Kirifuji,
//Ichika.Nakamasa, Hasumi.Hanekawa
