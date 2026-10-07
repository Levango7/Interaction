/**
 * IDB 图片 blob 全量备份往返 · 真浏览器端到端（v3.7.94 批次②/P2-8）
 * ----------------------------------------------------------------------------
 * jsdom 没有 IndexedDB（其契约是「无 IDB 安全降级」），所以三件事只能在真 Chromium 证明：
 *   ① img_<uid> blob 真的能经 doIdbExport 变成 dataURL 进备份文件；
 *   ② 清库后经 doIdbImport 真恢复到 kv（字节长度一致、MIME 一致）；
 *   ③ idbImages 的严格白名单真的挡得住伪造键：合法 img 键恢复；__dk_v2（设备密钥）、
 *      任意 kv 键、不合规命名（大写）全部被拒，且设备密钥原值不被覆盖。
 * 存储契约与 ui-scene-bind.js:31-33 一致：键 "img_"+uid、kv 商店、值为 Blob。
 * 默认跳过，E2E=1 才跑（npm run e2e）；本机跑法：-g 关键词一次一条，见 playwright.config.js 注释。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
// 1x1 透明 PNG（base64 内联，避免外置夹具）
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const PNG_SIZE = Buffer.from(PNG_B64, "base64").length;

test.describe("IDB 图片 blob 全量备份往返", () => {
  test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

  test("导出→清库→导入：img_ blob 字节往返、伪造键被白名单挡回", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#side", { timeout: 20000 });

    // 设备密钥由启动 initCrypto 异步生成；先等它落库，作为「不得被覆盖」的基准
    await expect
      .poll(() => page.evaluate(() => idbReadKey("__dk_v2").then((v) => typeof v === "string" && v.length > 0)), { timeout: 10000 })
      .toBe(true);
    const dkBefore = await page.evaluate(() => idbReadKey("__dk_v2"));

    // ① 写入图片 blob（与 ui-scene-bind 同款契约）
    await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      await idbMirrorKey("img_e2ez01", new Blob([bytes], { type: "image/png" }));
    }, PNG_B64);

    // ② 导出：函数返回值即备份对象（下载为副作用）
    const bk = await page.evaluate(() => doIdbExport());
    expect(bk._type).toBe("idb-backup");
    expect(bk.idbImages["img_e2ez01"], "图片应转为 dataURL 进备份").toMatch(/^data:image\/png;base64,/);

    // ③ 清库并确认已删（防「没删也过」的假绿）
    await page.evaluate(() => idbDeleteKey("img_e2ez01"));
    const gone = await page.evaluate(() => idbReadKey("img_e2ez01").then((v) => !v));
    expect(gone, "清库后 kv 键应不存在").toBe(true);

    // ④ 导入：backup 里注入伪造键（设备密钥 / 任意 kv 键 / 大写不合规），必须被白名单挡回
    await page.evaluate((data) => {
      data.idbImages["__dk_v2"] = "data:text/plain;base64,aGk=";
      data.idbImages["evil_probe_kv"] = "data:text/plain;base64,aGk=";
      data.idbImages["IMG_E2EZ02"] = "data:image/png;base64,aGk=";
      const file = new File([JSON.stringify(data)], "probe.idbbackup", { type: "application/json" });
      doIdbImport(file);
    }, bk);

    // ⑤ 轮询等待恢复完成（导入尾部 900ms 后 reload；执行上下文销毁期间返回哨兵值并重试）
    await expect
      .poll(
        async () => {
          try {
            return await page.evaluate(() => idbReadKey("img_e2ez01").then((v) => (v && typeof v.size === "number" ? v.size : -1)));
          } catch (e) { return -2; }
        },
        { timeout: 15000, message: "图片 blob 未在导入后回到 kv" }
      )
      .toBe(PNG_SIZE);

    // ⑥ 伪造键与设备密钥原值不得被动过；MIME 随往返保留
    const after = await page.evaluate(async () => ({
      evil: await idbReadKey("evil_probe_kv"),
      upper: await idbReadKey("IMG_E2EZ02"),
      dk: await idbReadKey("__dk_v2"),
      mime: await idbReadKey("img_e2ez01").then((v) => v && v.type),
    }));
    expect(after.evil == null, "任意 kv 键不得被伪造备份注入").toBe(true);
    expect(after.upper == null, "不合规命名（大写）不得被恢复").toBe(true);
    expect(after.dk, "设备密钥不得被伪造备份覆盖").toBe(dkBefore);
    expect(after.mime, "MIME 应随往返保留").toBe("image/png");
  });
});
