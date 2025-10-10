import "./styles.css";
import { useState } from "react";
import { useReducer } from "react";
import { Header } from "./components/Header";
import { Title } from "./components/Title";
import { Menu } from "./components/Menu";
import { Order } from "./components/Order";
import { Footer } from "./components/Footer";
import { TimeSelect } from "./components/TimeSelect";
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

// デバッグ用: 選択時刻がAppで取得できているか確認
// console.log("Appが保持する予約時刻:", selectedTime);

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
  //予約時刻を保持するための状態;
  const [selectedTime, setSelectedTime] = useState(null);
  const [state, dispatch] = useReducer(screenState, initialState);
  const goto = (s) => dispatch({ type: "GOTO", step: s });
  const next = () => {
    if (state.step === "menu" && calculateNumberOfDrinksInMenu() === 0) {
      // ドリンク選択の必要がない場合はそのままcart画面へ
      dispatch({ type: "GOTO", step: "cart" });
    } else if (state.step === "drink") {
      // drinkからカート画面に移る時、cartを整理
      dispatch({ type: "ORGANIZE_CART" });
      dispatch({ type: "NEXT" });
      useEffect(() => {
        console.log("cart updated:", state.cart);
      }, [state.cart]);
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
            <TimeSelect onTimeChange={setSelectedTime} testTime={false} />
            {/* 他の入力フィールドやボタン */}
          </div>
        </>
      )}
      {state.step === "payment" && (
        <>
          <p style={{ marginLeft: "10px" }}>外部決済サービスに接続中...</p>
          {/*＜TODO： 数秒待機して、サーバーよりID取得、squareAPI＞ */}
          {/*＜TODO： PaymentResultに遷移＞ */}
        </>
      )}
      {state.step === "paymentResult" && (
        <>
          {/*＜TODO： 決済成功したならcookie付与、サーバーAPI＞ */}
          <p>注文完了／エラーハンドリング</p>
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
//Mika.Misono, Seia.Yurizono, Nagisa.kirifuji,
//Ichika.Nakamasa, Hasumi.Hanekawa
