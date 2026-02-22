const env = (typeof process !== "undefined" ? process.env.TARO_ENV : undefined) || "h5";

export function isH5() {
  return env === "h5";
}

export function platformLabel() {
  return isH5() ? "Web(H5)" : "微信小程序";
}

export function platformClassName() {
  return isH5() ? "platform-h5" : "platform-weapp";
}
