/**
 * DL-O13 临时探针（耗材分支 tmp/dl-o13-red-probe，验完即删，不合入 main）
 * ---------------------------------------------------------------------------
 * 目的：注入一条必然失败的断言，让 CI 的 e2e 腿真红，验证 ci.yml 的
 * 「上传 e2e 失败现场（test-results）」artifact（e2e-test-results-ci）落地可读。
 * 形态与 DL-O12 先例同款；不动任何产品代码、不动判据四项、不抬任何超时。
 */
const { test, expect } = require("./_fixture");

test("DL-O13 注入必然失败样本：验 e2e-test-results-ci artifact 落地", async ({ page }) => {
  await page.goto("./agent-workbench.html");
  await expect(1, "DL-O13 注入必然失败样本：验 artifact 落地").toBe(2);
});
