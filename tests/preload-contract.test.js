import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * preload-contract.test.js —— electron/preload.js 暴露面契约（v3.7.66 新增）
 *
 * 为什么要有这个文件：桌面版专属能力靠的是「主进程注册一个 IPC + preload 暴露同名方法 +
 * 渲染层探测该方法」三段接线。此前两侧各自有测试（IPC 行为在 electron-ipc.test.js，
 * 渲染层分流在 notify-webhook.test.js），**中间的 preload 暴露面没有任何用例覆盖** ——
 * 只要 preload 少暴露一个方法或改了名，渲染层的 `typeof api.notifySend === "function"`
 * 恒为 false，钉钉就永久退回"仅桌面版但桌面版也用不了"，而全部门禁照绿。
 * 这正是「函数正确 ≠ 被接线」那一类，所以这里把 provider 侧钉死，
 * 与 notify-webhook.test.js §⑥ 的 consumer 侧断言合成一个闭环。
 *
 * 做法：把 preload.js 读出来，用一个假的 require("electron") 执行它，捕获真正交给
 * contextBridge.exposeInMainWorld 的那个对象 —— 测的是实际暴露的东西，不是文本正则。
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadPreload() {
  const src = fs.readFileSync(path.join(ROOT, "electron", "preload.js"), "utf8");
  const invoked = [];
  const stubElectron = {
    contextBridge: {
      exposeInMainWorld: (name, obj) => { invoked.push({ name, obj }); }
    },
    ipcRenderer: {
      invoke: (channel, arg) => { invoked.push({ channel, arg }); return Promise.resolve({ ok: true, status: 200, body: {} }); },
      send: (channel, arg) => { invoked.push({ channel, arg }); }
    }
  };
  const fakeRequire = (id) => {
    if (id === "electron") return stubElectron;
    throw new Error("preload.js 不应 require 别的模块，实际要了：" + id);
  };
  // eslint-disable-next-line no-new-func
  new Function("require", "module", "exports", src)(fakeRequire, { exports: {} }, {});
  return { exposed: invoked.find((x) => x.name === "electronAPI"), invoked };
}

describe("electron/preload.js 暴露面契约", () => {
  const { exposed, invoked } = loadPreload();

  it("以 electronAPI 这个名字暴露，且只有一个暴露点", () => {
    expect(exposed, "preload 必须 exposeInMainWorld(\"electronAPI\", …)").toBeTruthy();
    expect(invoked.filter((x) => x.name).length, "不应有多个全局暴露面").toBe(1);
  });

  /* 这份清单就是渲染层被允许依赖的全部能力。加方法要同时：主进程注册 IPC + 这里登记 +
     渲染层有用例。漏登记的那一侧就会在渲染层静默失效。 */
  it("暴露的方法覆盖既有消费面 + v3.7.66 的 notifySend", () => {
    const keys = Object.keys(exposed.obj);
    for (const required of ["getAutoLaunch", "setAutoLaunch", "getAiConfig", "setAiConfig", "chat", "abortChat", "notifySend"]) {
      expect(keys, `electronAPI 缺方法 ${required}（渲染层会探测不到而静默降级）`).toContain(required);
      expect(typeof exposed.obj[required], `${required} 必须是函数`).toBe("function");
    }
  });

  it("notifySend 打到 notify-send 通道，且参数原样透传", async () => {
    const arg = { url: "https://oapi.dingtalk.com/robot/send?access_token=x", payload: { msgtype: "text" } };
    const r = await exposed.obj.notifySend(arg);
    const hit = invoked.find((x) => x.channel === "notify-send");
    expect(hit, "notifySend 必须 invoke(\"notify-send\", arg)").toBeTruthy();
    expect(hit.arg).toEqual(arg);
    expect(r.ok, "主进程返回的结构要原样回到渲染层").toBe(true);
  });

  it("主进程没注册 notify-send 时 preload 不能自己兜底成功", () => {
    /* 分流逻辑在渲染层（有 notifySend 才走 IPC），preload 只是薄管道：
       它若在这里 try/catch 造一个 {ok:true}，钉钉的失败就会被伪装成成功。 */
    const src = fs.readFileSync(path.join(ROOT, "electron", "preload.js"), "utf8");
    const line = src.split(/\r?\n/).find((l) => l.includes("notifySend"));
    expect(line, "notifySend 这一行应当只是 ipcRenderer.invoke 的包装").toMatch(/ipcRenderer\.invoke\(\s*"notify-send"/);
    expect(line).not.toMatch(/catch|then|ok:\s*true/);
  });
});
