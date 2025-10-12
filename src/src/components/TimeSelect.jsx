import React, { useState, useMemo, useEffect } from "react";

// 定数
const START_OFFSET_MINUTES = 10;
const LAST_ORDER_HOUR = 17;
const INTERVAL_MINUTES = 5;

// 予約可能な時刻オプションの配列を生成
const generateTimeOptions = (now) => {
  const startTargetTime = new Date(
    now.getTime() + START_OFFSET_MINUTES * 60000
  );

  const minutes = startTargetTime.getMinutes();
  const minutesToRound = minutes % INTERVAL_MINUTES;
  const roundedMinutes =
    minutesToRound === 0
      ? minutes
      : minutes + (INTERVAL_MINUTES - minutesToRound);

  const startTime = new Date(startTargetTime);
  startTime.setMinutes(roundedMinutes);
  startTime.setSeconds(0, 0);
  startTime.setMilliseconds(0);

  const options = [];
  let currentTime = startTime;

  while (true) {
    const currentHour = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();

    if (
      currentHour > LAST_ORDER_HOUR ||
      (currentHour === LAST_ORDER_HOUR && currentMinutes > 0)
    )
      break;

    const hh = String(currentHour).padStart(2, "0");
    const mm = String(currentMinutes).padStart(2, "0");
    const timeString = `${hh}:${mm}`;
    options.push({ value: timeString, label: timeString });

    currentTime = new Date(currentTime.getTime() + INTERVAL_MINUTES * 60000);
  }

  return options;
};

// 本体
export const TimeSelect = ({ onTimeChange, testTime }) => {
  // now は testTime があればそれ、なければ現在時刻
  const now = useMemo(
    () => (testTime ? new Date(testTime) : new Date()),
    [testTime]
  );
  const timeOptions = useMemo(() => generateTimeOptions(now), [now]);

  // 画面表示用：現在時刻
  const currentHour = String(now.getHours()).padStart(2, "0");
  const currentMinutes = String(now.getMinutes()).padStart(2, "0");
  const formattedTime = `${currentHour}:${currentMinutes}`;

  // 選択値（制御コンポーネント）
  const [selected, setSelected] = useState(timeOptions[0]?.value ?? "");

  // オプションが変わったら先頭に合わせる（render中に親へは通知しない）
  useEffect(() => {
    setSelected(timeOptions[0]?.value ?? "");
  }, [timeOptions]);

  // 親への通知は selected が変わったときだけ
  useEffect(() => {
    if (!onTimeChange) return;
    if (!selected) {
      onTimeChange(null);
    } else {
      onTimeChange(selected); // ← App 側は "HH:MM" を想定しているのでそのまま渡す
    }
  }, [selected, onTimeChange]);

  if (timeOptions.length === 0) {
    return (
      <p style={{ ...containerStyle, color: "red" }}>
        本日の予約受付は終了しました。
      </p>
    );
  }

  return (
    <div style={containerStyle}>
      <p style={titleStyle}>予約時刻確認</p>
      <p style={currentTimeStyle}>現在時刻: {formattedTime}</p>
      <label htmlFor="reservation-time" style={labelStyle}>
        予約時刻を選択してください:
      </label>
      <select
        id="reservation-time"
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        style={selectStyle}
      >
        {timeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// --- スタイル---

const titleStyle = {
  textAlign: "center",
  fontSize: "22px",
  fontWeight: "bold",
  marginTop: "16px",
};

const containerStyle = {
  padding: "16px",
  fontFamily: "Arial, sans-serif",
  maxWidth: "400px",
  margin: "0 auto",
};

const labelStyle = {
  display: "block",
  marginBottom: "8px",
  fontSize: "16px",
};

const selectStyle = {
  width: "100%",
  padding: "12px",
  fontSize: "18px",
  border: "1px solid #ccc",
  borderRadius: "8px",
  minHeight: "48px",
  appearance: "none",
  WebkitAppearance: "none",
};

const currentTimeStyle = {
  textAlign: "center",
  fontSize: "18px",
  fontWeight: "bold",
  color: "#333",
  marginBottom: "20px",
  padding: "8px",
  backgroundColor: "#eaeaea",
  borderRadius: "4px",
};
