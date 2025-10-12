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

//値段
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

const isSoldout = {
  10: false,
  20: false,
  30: false,
  40: false,
  50: false,
  91: false,
  92: false,
  93: false,
  94: false,
};

//完成時にtitleに戻しておく
const initialState = {
  step: "title",
  cart: {
    //以下は内部処理のみに使う商品ID
    91: 0,
    92: 0,
    93: 0,
    94: 0,
    30: 0,
    40: 0,
    50: 0,

    //以下は実際に存在する商品ID
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

// ------ ScreenState ------

const screenState = (state, action) => {
  switch (action.type) {
    //ここから下は画面遷移
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
    //ここから下はカートのアイテム操作
    case "ADD_ITEM": {
      const { itemId } = action;
      const currentCount = state.cart[itemId] || 0;
      return {
        ...state,
        cart: {
          ...state.cart,
          [itemId]: currentCount + 1,
        },
      };
    }
    case "REMOVE_ITEM": {
      const { itemId } = action;
      const currentCount = state.cart[itemId] || 0;
      if (currentCount > 0) {
        return {
          ...state,
          cart: {
            ...state.cart,
            [itemId]: currentCount - 1,
          },
        };
      }
      return state;
    }
    case "ADD_DRINK": {
      const { itemId } = action;
      const currentCount = state.cart[itemId] || 0;
      return {
        ...state,
        cart: {
          ...state.cart,
          [itemId]: currentCount + 1,
        },
      };
    }
    case "REMOVE_DRINK": {
      const { itemId } = action;
      const currentCount = state.cart[itemId] || 0;
      if (currentCount > 0) {
        return {
          ...state,
          cart: {
            ...state.cart,
            [itemId]: currentCount - 1,
          },
        };
      }
      return state;
    }
    //ここから下はカートの内部処理
    case "CLEAR_TEMPORARY_DRINKS": {
      // ID91,92,93,94の中身を削除する
      const newCart = { ...state.cart };
      newCart[91] = 0;
      newCart[92] = 0;
      newCart[93] = 0;
      newCart[94] = 0;
      return { ...state, cart: newCart };
    }
    case "DELETE_TEMPORARY": {
      // ID30,40,50の中身を削除する
      const newCart = { ...state.cart };
      newCart[30] = 0;
      newCart[40] = 0;
      newCart[50] = 0;
      return { ...state, cart: newCart };
    }
    // 仮IDの注文を実IDに入れる
    case "ORGANIZE_CART": {
      const cart = state.cart;
      const newCart = { ...cart };
      let sumM = newCart[40] || 0;
      let sumL = newCart[50] || 0;

      //初期化
      for (let i = 31; i <= 34; i++) newCart[i] = 0;
      for (let i = 41; i <= 44; i++) newCart[i] = 0;
      for (let i = 51; i <= 54; i++) newCart[i] = 0;

      //割り当て
      for (let d = 91; d <= 94; d++) {
        const drinkNo = d - 90; // 1..4
        let qty = newCart[d] || 0;
        const takeM = Math.min(qty, sumM);
        if (takeM > 0) {
          const target = 40 + drinkNo; // 41–44
          newCart[target] = (newCart[target] || 0) + takeM;
          sumM -= takeM;
          qty -= takeM;
        }
        const takeL = Math.min(qty, sumL);
        if (takeL > 0) {
          const target = 50 + drinkNo; // 51–54
          newCart[target] = (newCart[target] || 0) + takeL;
          sumL -= takeL;
          qty -= takeL;
        }
        if (qty > 0) {
          const target = 30 + drinkNo; // 31–34
          newCart[target] = (newCart[target] || 0) + qty;
          qty = 0;
        }
      }
      return { ...state, cart: newCart };
    }
    case "REPLACE_CART": {
      // 引数 cart の全量で置き換え（存在しないIDは0想定なら上書きでOK）
      // cookie用
      return { ...state, cart: { ...state.cart, ...action.cart } };
    }
    default:
      return state;
  }
};

// ------ 決済成功／非成功　成功ならばcookie作成＆情報送信 ------

// ------ 本体 ------

export const App = () => {
  //＜DANGER:本番は必ずfalseにすること＞
  const USE_MOCK_PAYMENT = false;

  //予約時刻を保持するための状態;
  const [selectedTime, setSelectedTime] = useState(null);
  const [state, dispatch] = useReducer(screenState, initialState);

  // 支払い段階の表示制御："connecting" → "input"
  const [paymentPhase, setPaymentPhase] = useState("connecting");
  const paymentTimerRef = useRef(null);

  // payment 結果（paymentResult で使う）
  const [paymentOutcome, setPaymentOutcome] = useState({
    ok: false,
    orderId: null,
    error: null,
    receiptUrl: null,
  });

  const [usingDevCfg, setUsingDevCfg] = useState(false);

  const goto = (s) => dispatch({ type: "GOTO", step: s });
  const next = () => {
    if (state.step === "menu" && calculateNumberOfDrinksInMenu() === 0) {
      // ドリンク選択の必要がない場合はそのままcart画面へ
      dispatch({ type: "GOTO", step: "cart" });
    } else if (state.step === "drink") {
      // drinkからカート画面に移る時、cartを整理
      dispatch({ type: "ORGANIZE_CART" });
      dispatch({ type: "NEXT" });
    } else {
      dispatch({ type: "NEXT" });
    }
  };
  const prev = () => {
    if (state.step === "cart") {
      //cart画面から戻る場合はdrink選択を初期化してmenu画面へ
      dispatch({ type: "CLEAR_TEMPORARY_DRINKS" });
      dispatch({ type: "GOTO", step: "menu" });
    } else {
      dispatch({ type: "PREV" });
    }
  };
  const addItems = (id) => dispatch({ type: "ADD_ITEM", itemId: id });
  const removeItems = (id) => dispatch({ type: "REMOVE_ITEM", itemId: id });

  //menu画面で選んだドリンク入りメニューの数を計算
  const calculateNumberOfDrinksInMenu = () => {
    return state.cart[30] + state.cart[40] + state.cart[50];
  };

  //drink画面で選んだドリンクの数を計算
  const calculateNumberOfDrinksInDrink = () => {
    return state.cart[91] + state.cart[92] + state.cart[93] + state.cart[94];
  };

  const calculateDifferenceOfDrinks = () => {
    return calculateNumberOfDrinksInMenu() - calculateNumberOfDrinksInDrink();
  };
  const calculateSumInMenu = () => {
    return (
      state.cart[10] +
      state.cart[20] +
      state.cart[30] +
      state.cart[40] +
      state.cart[50]
    );
  };

  const calculateSumPrice = () => {
    return (
      prices[10] * state.cart[10] +
      prices[20] * state.cart[20] +
      prices[30] * state.cart[30] +
      prices[40] * state.cart[40] +
      prices[50] * state.cart[50]
    );
  };

  // Square Card のインスタンス保持
  const cardRef = useRef(null);
  // 明示的に「カードUIが正常にattachされている」かを示すフラグ
  const [cardAttached, setCardAttached] = useState(false);

  // billing info placeholders (開発中は UI を追加しない場合ここは空。必要なら UI を追加して値を入れてください)
  const [billingFamilyName, setBillingFamilyName] = useState("");
  const [billingGivenName, setBillingGivenName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [billingCountryCode, setBillingCountryCode] = useState("JP");

  // card-container の中身をクリア
  function clearCardContainer() {
    const el = document.getElementById("card-container");
    if (el) el.innerHTML = "";
  }

  // 既存カードUIの破棄（存在すれば）
  async function destroyCardIfAny() {
    try {
      if (cardRef.current && typeof cardRef.current.destroy === "function") {
        await cardRef.current.destroy();
      }
    } catch (_) {
      // destroy未対応でも無視
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

  // 入力フェーズで #card-container に attach（必要なら再attach）
  async function ensureCardMounted(applicationId, locationId) {
    // DOM描画を待つユーティリティ
    function nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
    async function waitForContainer() {
      // 最大3フレームだけ待ってから判定
      for (let i = 0; i < 3; i++) {
        const el = document.getElementById("card-container");
        if (el) return el;
        await nextFrame();
      }
      console.error(
        "DEBUG: waitForContainerがタイムアウトしました。DOMが見つかりません。"
      );
      return null;
    }

    if (!window.Square) throw new Error("Square SDKが読み込まれていません");
    // すぐgetElementByIdせず、描画を最長3フレーム待つ
    const container = await waitForContainer();
    if (!container) throw new Error("#card-container が見つかりません");

    // 既に cardRef がある場合: DOMにアタッチ済みならフラグを立てて終了、子要素が無ければ再attachを試みる
    if (cardRef.current) {
      if (container.childElementCount === 0) {
        try {
          console.log("DEBUG: 再attachを試みます...");
          await pTimeout(
            cardRef.current.attach("#card-container"),
            5000,
            "カードUIの attach がタイムアウトしました。\n" +
              "・埋め込みプレビューではなく新規タブで開く\n" +
              "・Square の Allowed origins に現在のURLを登録"
          );
          setCardAttached(true);
          console.log("DEBUG: 再attach成功 — cardAttached=true");
          return;
        } catch (err) {
          console.warn(
            "DEBUG: 再attachに失敗しました。破棄して新規作成にフォールバック",
            err
          );
          await destroyCardIfAny();
        }
      } else {
        setCardAttached(true);
        console.log("DEBUG: 既にDOMにアタッチ済み — cardAttached=true");
        return;
      }
    }

    // cardRef が無ければ新規作成して attach
    let payments;
    try {
      payments = window.Square.payments(applicationId, locationId);
    } catch (e) {
      throw new Error(
        "Square.payments の初期化に失敗: " +
          (e?.message || "") +
          "\n→ Developer Console の Allowed origins（Allowed domains）に\n" +
          window.location.origin +
          " を追加してください。"
      );
    }

    const card = await payments.card();
    await pTimeout(
      card.attach("#card-container"),
      5000,
      "カードUIの attach がタイムアウトしました。\n" +
        "・新規タブで開く\n・Allowed origins に " +
        window.location.origin +
        " を登録"
    );
    cardRef.current = card;
    setCardAttached(true);
    console.log(
      "DEBUG: 新規作成して attach 成功 — cardRef set and cardAttached=true"
    );
  }

  useEffect(() => {
    if (state.step !== "payment") return;

    setPaymentPhase("connecting");
    if (paymentTimerRef.current) clearTimeout(paymentTimerRef.current);
    destroyCardIfAny(); // 古いUI掃除

    paymentTimerRef.current = setTimeout(async () => {
      try {
        const cfg = await Api.getSquareConfig();
        await loadSquareSdk(cfg?.environment || "PRODUCTION");
        setPaymentPhase("input"); // ← ここでは切り替えだけ（DOMはまだ）
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
          // DOMが描画された後に確実に ensureCardMounted を実行
          await ensureCardMounted(cfg.applicationId, cfg.locationId);
        } catch (e) {
          alert(e?.message || "#card-container の初期化に失敗しました");
          dispatch({ type: "GOTO", step: "cart" });
        }
      })();
    }, 100); // 100ミリ秒のわずかな遅延を設定

    return () => {
      clearTimeout(attachTimer); // クリーンアップ関数にタイマーのクリアを追加
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

  // buildVerificationDetails を billingContact に対応させる（billingContact が無ければ最小オブジェクトを付与）
  function buildVerificationDetails(amountYen, billingContact) {
    const base = {
      amount: String(amountYen), // 例: "720"（JPYは小数なし）
      currencyCode: "JPY",
      intent: "CHARGE",
      customerInitiated: true,
      sellerKeyedIn: false,
    };
    if (billingContact && typeof billingContact === "object") {
      base.billingContact = billingContact;
    } else {
      // Square SDK が billingContact を必須にする設定の場合に備え、最低限のオブジェクトを渡す
      base.billingContact = { countryCode: "JP" };
    }
    return base;
  }

  const handleSubmitOrderFlow = async () => {
    if (!(await canUseCookies()))
      throw new Error("このブラウザではCookieが使えません。");

    const items = buildOrderItems(state.cart);
    if (items.length === 0) throw new Error("カートが空です");

    const reservedDate = parseReservedToDate(selectedTime);
    if (!reservedDate) throw new Error("予約時刻が不正です");

    const reservedAtIso = reservedDate.toISOString();
    const createdAtIso = new Date().toISOString();
    const amount = calculateSumPrice();

    const cfg = await Api.getSquareConfig();
    const applicationId = cfg?.applicationId;
    const locationId = cfg?.locationId;
    if (!applicationId || !locationId)
      throw new Error("Square設定が不足しています。");

    try {
      // ここまでで SDK はロード済み（paymentPhase === "input" 前提）
      if (!cardRef.current) {
        const cfg2 = await Api.getSquareConfig(); // getSquareConfigSafe は未定義だったため置換
        await ensureCardMounted(cfg2.applicationId, cfg2.locationId);
        if (!cardRef.current) throw new Error("カードUIの初期化に失敗しました");
      }
      console.log("DEBUG: Card UIアタッチ成功後のcardRef:", cardRef.current);

      // --- 安全パッチ: 開発中は tokenization をスキップしてカード情報を外部に送らない ---
      let sourceId = null;

      if (USE_MOCK_PAYMENT) {
        console.log(
          "DEBUG: USE_MOCK_PAYMENT=true のため tokenization をスキップします"
        );
        sourceId = "MOCK-SOURCE-" + Math.floor(Math.random() * 100000);
      } else {
        // 本番: billingContact を作成してトークン化
        const billingContact = {
          familyName: billingFamilyName || "",
          givenName: billingGivenName || "",
          email: billingEmail || "",
          countryCode: billingCountryCode || "JP",
        };

        console.log("DEBUG: tokenization を実行します");
        const verificationDetails = buildVerificationDetails(
          amount,
          billingContact
        );
        console.log("DEBUG: verificationDetails:", verificationDetails);

        const result = await cardRef.current.tokenize(verificationDetails);
        console.log("DEBUG: tokenize result:", result);

        if (result.status !== "OK") {
          const msg =
            result.errors?.[0]?.message || "カードのトークン化に失敗しました";
          throw new Error(msg);
        }
        sourceId = result.token;
      }
      // --- end of tokenization block ---

      // 注文作成＆決済（モック or 実API）
      let orderId, payment;
      if (USE_MOCK_PAYMENT) {
        // ---- モック（バック無しでフローを通す用）----
        orderId = "MOCK-" + Math.floor(Math.random() * 100000);
        await new Promise((r) => setTimeout(r, 300)); // 体感ウェイト
        payment = { status: "APPROVED", receiptUrl: "" };
        // ---------------------------------------------
      } else {
        const order = await Api.createOrder({
          items,
          reservedAtIso,
          createdAtIso,
          amount,
        });
        orderId = order?.orderId;
        if (!orderId) throw new Error("orderIdの発行に失敗しました");

        payment = await Api.chargeOrder({
          orderId,
          sourceId,
          items,
          reservedAtIso,
          createdAtIso,
          amount,
        });
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
      setPaymentOutcome({
        ok: false,
        orderId: null,
        error: e?.message || "決済処理中にエラーが発生しました",
        receiptUrl: null,
      });
    }
    dispatch({ type: "GOTO", step: "paymentResult" });
  };

  // ＜TODO: cookieの確認＞

  // ------ ここからreturn ------

  return (
    <>
      <header>
        <Header />
        <div style={{ minHeight: "10px" }}></div>
      </header>

      {state.step === "title" && <Title onStart={next} />}

      {state.step === "menu" && (
        <>
          {/* ＜TODO: バックエンドから売り切れトグルの読み込み＞ */}
          {/* ＜TODO: 時間参照し、17時以降だったら全売り切れ＞ */}
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
                image={testImg} //テストイメージ
                isSoldout={isSoldout[40]}
                //＜TODO: image={img40}＞
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
                isSoldout={isSoldout[50]}
                //TODO: image={img50}
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
                isSoldout={isSoldout[10]}
                //TODO: image={img10}
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
                isSoldout={isSoldout[20]}
                //TODO: image={img20}
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
                isSoldout={isSoldout[30]}
                //TODO: image={img30}
              />
            </div>
          </div>
          {/* フッターの高さを変えたらここも変えないとボタン押せなくなる */}
          <div style={{ minHeight: "60px" }}></div>
        </>
      )}

      {state.step === "drink" && (
        <>
          <p
            style={{
              textAlign: "center",
              fontSize: "22px",
              margin: "10px auto",
            }}
          >
            飲み物を選択してください
          </p>
          {calculateDifferenceOfDrinks() > 0 && (
            <p
              style={{
                textAlign: "center",
                fontSize: "30px",
                fontWeight: "bold",
                margin: "10px auto",
                backgroundColor: "#9eceff",
              }}
            >
              {`あと ${calculateDifferenceOfDrinks()} 個`}
            </p>
          )}
          {calculateDifferenceOfDrinks() > 0 || (
            <p
              style={{
                textAlign: "center",
                fontSize: "30px",
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
                isDrinkScreen={state.step === "drink"}
                isSoldout={isSoldout[91]}
                //TODO: image={img91}
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
                isDrinkScreen={state.step === "drink"}
                isSoldout={isSoldout[92]}
                //TODO: mage={img92}
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
                isDrinkScreen={state.step === "drink"}
                isSoldout={isSoldout[93]}
                //TODO: image={img93}
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
                isDrinkScreen={state.step === "drink"}
                isSoldout={isSoldout[94]}
                //TODO: image={img94}
              />
            </div>
          </div>
          {/* フッターの高さを変えたらここも変えないとボタン押せなくなる */}
          <div style={{ minHeight: "60px" }}></div>
        </>
      )}

      {state.step === "cart" && (
        //TODO: 時間過ぎたら注文できないようにする
        <>
          <p
            style={{
              textAlign: "center",
              fontSize: "22px",
              fontWeight: "bold",
              margin: "16px auto",
            }}
          >
            ご注文内容の確認
          </p>
          <div>
            <Order cart={state.cart} price={prices} names={itemNames} />
            {/* フッターの高さを変えたらここも変えないとボタン押せなくなる */}
            <div style={{ minHeight: "60px" }}></div>
          </div>
        </>
      )}

      {state.step === "time" && (
        <>
          <div className="reservation-page-wrapper">
            {/* testTimeにtestDateを代入するとデバッグモード、falseを代入すると本番モード */}
            <TimeSelect onTimeChange={setSelectedTime} testTime={testDate} />
            {/* 他の入力フィールドやボタン */}
          </div>
        </>
      )}
      {state.step === "payment" && (
        <>
          {/*＜TODO： 数秒待機して、サーバーよりID取得、squareAPI＞ */}
          {/*＜TODO： PaymentResultに遷移＞ */}
          {paymentPhase === "connecting" && (
            <p style={{ marginLeft: "10px" }}>外部決済サービスに接続中...</p>
          )}
          {paymentPhase === "input" && (
            <div style={{ padding: "12px 10px" }}>
              <p style={{ margin: "6px 10px" }}>カード情報の入力</p>

              {/* もし氏名やメールを取るならここに入力欄を追加して billingFamilyName 等に入れてください */}
              <div id="card-container" style={{ margin: "12px 10px" }} />
              <button
                style={{ marginLeft: 10, width: 160, height: 22, fontSize: 10 }}
                disabled={!cardAttached}
                onClick={async () => {
                  try {
                    await handleSubmitOrderFlow();
                  } catch (e) {
                    alert(e?.message || "決済でエラーが発生しました");
                  }
                }}
              >
                {cardAttached ? "支払う" : "準備中..."}
              </button>
            </div>
          )}
        </>
      )}
      {state.step === "paymentResult" && (
        <>
          {/*＜TODO： 決済成功したならcookie付与、サーバーAPI＞ */}
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
                    // 結果をクリア → paymentへ。入場時のuseEffectが初期化〜attachを実施
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
                    // 結果をクリア → paymentへ。入場時のuseEffectが初期化〜attachを実施
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
          {/*＜TODO： ここに遷移する前にcookieからカート情報を取得、ID情報を取得＞ */}

          <p
            style={{
              textAlign: "center",
              fontSize: "22px",
              fontWeight: "bold",
              margin: "16px auto",
            }}
          >
            ご注文ありがとうございます！
          </p>
          <p
            style={{
              textAlign: "center",
              fontSize: "20px",
              margin: "16px 0px 2px 0px",
            }}
          >
            注文番号
          </p>
          <p
            style={{
              textAlign: "center",
              fontSize: "60px",
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
            {/* ＜TODO: 時間が有効な場合のみ遷移を有効にする＞ */}
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
