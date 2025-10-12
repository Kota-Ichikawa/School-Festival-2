// フロント -> バックエンドの API 呼び出しラッパー

// WARNING:本番環境ではこちらにする
// WARNING:最低限のフォールバック（本番ではサーバ側で渡し、これは消す。）
// const FALLBACK_SQUARE = {
//   applicationId: "sq0idp-VLfeIy3EnmoACHjocINrRA",
//   locationId: "LYP1FB67EDXBN",
//   environment: "PRODUCTION",
// };

//WARNING:テスト環境ではこちらにする
const FALLBACK_SQUARE = {
  applicationId: "sandbox-sq0idb-TSpPtbWlulBoJyV0q3lPgQ",
  locationId: "LYP1FB67EDXBN",
  environment: "SANDBOX",
};

export const Api = {
  // Square 設定の取得:
  // 優先順:
  // 1) /api/square/config があればそこを使う（推奨：サーバが applicationId, locationId, environment を返す）
  // 2) なければ /api/payment/get/ApplicationId から applicationId を取得し、残りはフォールバック
  async getSquareConfig() {
    try {
      // try server-provided full config first
      const res = await fetch("/api/square/config");
      if (res.ok) {
        const cfg = await res.json();
        return {
          applicationId: cfg?.applicationId || FALLBACK_SQUARE.applicationId,
          locationId: cfg?.locationId || FALLBACK_SQUARE.locationId,
          environment: cfg?.environment || FALLBACK_SQUARE.environment,
        };
      }
    } catch {
      // ignore and fallback to next
    }

    try {
      const res2 = await fetch("/api/payment/get/ApplicationId");
      if (res2.ok) {
        const appId = await res2.text();
        return {
          applicationId: appId || FALLBACK_SQUARE.applicationId,
          locationId: FALLBACK_SQUARE.locationId,
          environment: FALLBACK_SQUARE.environment,
        };
      }
    } catch {
      // ignore
    }

    // 最終フォールバック
    return { ...FALLBACK_SQUARE };
  },

  // 在庫（売切れ）取得:
  // 要求どおり: itemIds = [10,20,91,92,93,94] をループして個別取得する。
  // 各エンドポイント: GET /api/items/get/byitemId/{itemId}
  // 返り値: { soldout: { "<itemId>": true|false, ... } }
  async fetchSoldoutMap() {
    const itemIds = [10, 20, 91, 92, 93, 94];
    const soldout = {};
    for (const id of itemIds) {
      try {
        const res = await fetch(`/api/items/get/byitemId/${id}`);
        if (!res.ok) {
          console.warn(
            `fetchSoldoutMap: failed to fetch item ${id}`,
            res.status
          );
          // サーバがない/エラー時は安全側にして売切れとしない（false）
          soldout[id] = false;
          continue;
        }
        const item = await res.json();
        // backend の Item model に available フィールドがある前提
        soldout[id] = !item?.available; // available=false -> soldout true
      } catch (e) {
        console.warn(`fetchSoldoutMap: network error for item ${id}`, e);
        soldout[id] = false;
      }
    }
    return { soldout };
  },

  // 注文作成: POST /api/order/set
  // 送るボディは backend の OrderRequest DTO に合わせる必要あり。
  // 現状フロントでは { items, reservedTime, createdAt, amount } の形を使っています。
  async createOrder({ items, reservedAtIso, createdAtIso, amount }) {
    const body = {
      items,
      reservedTime: reservedAtIso,
      createdAt: createdAtIso,
      amount,
    };
    const res = await fetch("/api/order/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // エラーハンドリングは上位で行う
      throw new Error("注文作成に失敗しました");
    }
    return res.json(); // 期待: { orderId, ... }
  },

  // 決済呼び出し: バックエンド PaymentController に合わせる
  // backend defines: POST /api/payment/create/{orderId}/{sourceId}
  async chargeOrder({
    orderId,
    sourceId,
    items,
    reservedAtIso,
    createdAtIso,
    amount,
  }) {
    // path variables に sourceId を載せる（エンコード必須）
    const url = `/api/payment/create/${orderId}/${encodeURIComponent(
      sourceId
    )}`;
    // PaymentController.createPayment は path variables のみ受け取る実装のため body は不要。
    // もし backend が body を期待するよう変更したらここに JSON を付けてください。
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error("決済APIが失敗しました");
    return res.json(); // { status:"APPROVED"|"DECLINED", receiptUrl?, error? }
  },

  // 注文取得: backend のエンドポイントに合わせる
  // backend has: GET /api/order/get/byorderId/{orderId}
  async fetchOrder(orderId) {
    const res = await fetch(`/api/order/get/byorderId/${orderId}`);
    if (!res.ok) throw new Error("注文取得に失敗しました");
    return res.json();
  },
};
