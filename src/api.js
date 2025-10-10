const FALLBACK_SQUARE = {
  applicationId: "sq0idp-VLfeIy3EnmoACHjocINrRA", // 本番AppID
  locationId: "LYP1FB67EDXBN", // ロケーションID
  environment: "PRODUCTION", // "SANDBOX" or "PRODUCTION"
};

export const Api = {
  async getSquareConfig() {
    try {
      const res = await fetch("/api/square/config");
      if (!res.ok) throw new Error();
      const cfg = await res.json();
      // 空文字や欠損にフォールバック
      return {
        applicationId: cfg?.applicationId || FALLBACK_SQUARE.applicationId,
        locationId: cfg?.locationId || FALLBACK_SQUARE.locationId,
        environment: cfg?.environment || FALLBACK_SQUARE.environment,
      };
    } catch {
      return { ...FALLBACK_SQUARE };
    }
  },

  async fetchSoldoutMap() {
    const res = await fetch("/api/items");
    if (!res.ok) throw new Error("在庫情報の取得に失敗しました");
    const items = await res.json();
    const soldout = {};
    for (const it of items) soldout[it.itemId] = !it.available;
    return { soldout };
  },

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
    if (!res.ok) throw new Error("注文の作成に失敗しました");
    return res.json(); // { orderId, ... }
  },

  async chargeOrder({
    orderId,
    sourceId,
    items,
    reservedAtIso,
    createdAtIso,
    amount,
  }) {
    const res = await fetch("/api/payment/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        sourceId,
        items,
        reservedTime: reservedAtIso,
        createdAt: createdAtIso,
        amount,
      }),
    });
    if (!res.ok) throw new Error("決済APIが失敗しました");
    return res.json(); // { status:"APPROVED"|"DECLINED", receiptUrl?, error? }
  },

  async fetchOrder(orderId) {
    const res = await fetch(`/api/order/get/${orderId}`);
    if (!res.ok) throw new Error("注文の取得に失敗しました");
    return res.json();
  },
};
