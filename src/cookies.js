const encode = (v) => encodeURIComponent(v);
const decode = (v) => decodeURIComponent(v);

export const setCookieStr = (k, v, maxAgeSec = 12 * 60 * 60) => {
  document.cookie = `${encode(k)}=${encode(
    v
  )}; Max-Age=${maxAgeSec}; Path=/; Secure; SameSite=Lax`;
};

export const getCookieStr = (k) => {
  const hit = document.cookie
    .split("; ")
    .find((s) => s.startsWith(`${encode(k)}=`));
  return hit ? decode(hit.split("=")[1]) : undefined;
};

export const deleteCookie = (k) => {
  document.cookie = `${encode(k)}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
};

export const setCookieJSON = (k, obj, maxAgeSec = 12 * 60 * 60) => {
  setCookieStr(k, JSON.stringify(obj), maxAgeSec);
};

export const getCookieJSON = (k) => {
  const s = getCookieStr(k);
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
