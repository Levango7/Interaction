/**
 * L4 Webhook SSRF 校验加固 · 回归验证（v1.11.2 修复）
 * ----------------------------------------------------------------------------
 * 审查报告 L4：_validateWebhookUrl 可被非标准 IP 字面量绕过——
 *   ① 十进制整数 https://2130706433/（= 127.0.0.1）
 *   ② 十六进制 https://0x7f000001/、0x7f.0.0.1
 *   ③ 八进制 0177.0.0.1 与压缩点分 127.1
 *   ④ IPv6 形态 [::ffff:127.0.0.1]（映射私网）/ [fe80::1]（链路本地）/ [fc00::1]（ULA）
 * 另修复反向漏洞：[::1] 因 URL.hostname 带方括号而漏出 dev 白名单。
 *
 * v1.11.2：数值形主机统一按 inet_aton 兼容语义解析为 IPv4 字节后过黑名单；
 * IPv6 展开后检查回环/链路本地/ULA/组播；含字母的普通域名不受影响。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("L4 Webhook SSRF 校验（v1.11.2 修复回归）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });
  const V = (u) => win.__test._validateWebhookUrl(u);

  describe("绕过载荷全部拦截", () => {
    const BLOCKED = [
      "https://2130706433/",            // 十进制 32 位 = 127.0.0.1
      "https://2130706433/hook",
      "https://0x7f000001/",            // 十六进制 = 127.0.0.1
      "https://0x7f.0.0.1/",            // 混合十六段
      "https://0177.0.0.1/",            // 八进制
      "https://127.1/",                 // 压缩点分 = 127.0.0.1
      "https://127.0.0.2/",             // 127/8 非白名单回环
      "https://0x7f.1/",                // 压缩 + 十六
      "https://3232235521/",            // 192.168.0.1 的十进制
      "https://192.168.0.1/",
      "https://10.0.0.1/",
      "https://172.16.0.1/",
      "https://172.31.255.255/",
      "https://169.254.169.254/",       // 云元数据端点
      "https://0.0.0.0/",
      "https://100.64.0.1/",            // CGNAT
      "https://224.0.0.1/",             // 组播
      "https://[::ffff:127.0.0.1]/",    // IPv6 映射回环
      "https://[::ffff:192.168.0.1]/",  // IPv6 映射私网
      "https://[fe80::1]/",             // 链路本地
      "https://[fc00::1]/",             // ULA
      "https://[fd12::1]/",             // ULA
      "https://[ff02::1]/",             // 组播
      "https://localhost/hook",         // v1.11.2 策略：回环目标仅允许 http（防数值形伪装经白名单放行 https 回环）
      "https://127.0.0.1/hook",
      "https://[::1]/hook",
      "http://example.com/webhook",     // 公网 http（CSP 发不出去，直接拒）
      "ftp://example.com/x",
      "not a url",
    ];
    for (const u of BLOCKED) {
      it(`${JSON.stringify(u)} → false`, () => { expect(V(u)).toBe(false); });
    }
  });

  describe("合法目标放行（不误杀）", () => {
    const ALLOWED = [
      "https://example.com/webhook",
      "https://hooks.example.com:8443/path",
      "https://api.deepseek.com/v1/notify",
      "http://localhost/hook",           // dev 本机 http
      "http://localhost:9000/hook",
      "http://127.0.0.1:8080/hook",
      "https://[2606:4700::6810:85e5]/hook", // 公网 IPv6
    ];
    for (const u of ALLOWED) {
      it(`${JSON.stringify(u)} → true`, () => { expect(V(u)).toBe(true); });
    }
  });
});
