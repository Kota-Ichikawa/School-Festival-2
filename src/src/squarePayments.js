// // src/squarePayments.js
// export async function loadSquareSdk() {
//   const id = "square-web-payments-sdk";
//   if (document.getElementById(id)) return;
//   const s = document.createElement("script");
//   s.id = id;
//   s.src = "https://web.squarecdn.com/v1/square.js";
//   s.async = true;
//   await new Promise((ok, ng) => {
//     s.onload = ok;
//     s.onerror = () => ng(new Error("Square SDKの読み込みに失敗しました"));
//     document.head.appendChild(s);
//   });
// }

// export async function createCardSourceId({ applicationId, locationId }) {
//   if (!window.Square) throw new Error("Square SDKが読み込まれていません");
//   if (!applicationId) throw new Error("applicationId が未設定です");
//   if (!locationId) throw new Error("locationId が未設定です");

//   const payments = window.Square.payments(applicationId, locationId);
//   const card = await payments.card();
//   await card.attach("#card-container"); // payment画面に<div id="card-container" />が必要
//   const result = await card.tokenize();
//   if (result.status !== "OK") {
//     const msg =
//       result.errors?.[0]?.message || "カードのトークン化に失敗しました";
//     throw new Error(msg);
//   }
//   return result.token; // ← sourceId
// }

// squarePayments.js（置き換え）
export async function loadSquareSdk(env = "PRODUCTION") {
  const SRC =
    env === "SANDBOX"
      ? "https://sandbox.web.squarecdn.com/v1/square.js"
      : "https://web.squarecdn.com/v1/square.js";

  if (window.Square) {
    console.log("[square] SDK already present");
    return;
  }

  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => {
      console.log("[square] SDK loaded:", SRC);
      resolve();
    };
    s.onerror = () => {
      reject(new Error("square.js のロードに失敗: " + SRC));
    };
    document.head.appendChild(s);
  });
}
