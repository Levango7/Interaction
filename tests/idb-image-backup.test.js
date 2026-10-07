/**
 * 批次② P2-8 · IDB 图片 blob 全量备份（jsdom 逻辑层）
 * ----------------------------------------------------------------------------
 * 本文件能证明的（jsdom：有 Blob/FileReader/atob，但**没有 IndexedDB**）：
 *  ① _blobToDataURL ⇄ _dataURLToBlob 往返字节保真、MIME 保留；
 *  ② 非法 dataURL 守卫（只收 base64 形态）；
 *  ③ 无 IDB 环境下 doIdbExport 的降级形状：idbImages 恒存在且为空对象（形状稳定，不是 undefined）；
 *  ④ 无 IDB 环境下 doIdbImport 对 idbImages 段整体跳过且**如实计数**（不夸大 restoredCount）。
 *
 * 本文件结构上证明不了的（→ tests/e2e/idb-image-backup.spec.js 真 Chromium 补）：
 *  · img_<uid> blob 真正经 IDB 往返（jsdom 无 indexedDB，全部 idb* 函数是 no-op）；
 *  · 导入侧严格白名单真的挡得住伪造键（__dk_v2 / 任意 kv 键 / 不合规命名）。
 *
 * 运行：npm test -- idb-image-backup
 */

import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

// 导出走 Blob 下载：stub URL/anchor（Blob 保留真身，因为断言聚焦返回值而非下载物）
function stubDownload(win) {
  win.URL.createObjectURL = () => "blob:fake";
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () {};
}

// stub FileReader：readAsText 后用给定内容触发 onload（同 p0-crossdevice-key.test.js 手法）
function stubImport(win, content) {
  const RealFR = win.FileReader;
  class FakeFileReader {
    constructor() {
      this.result = "";
    }
    readAsText() {
      this.result = content;
      setTimeout(() => {
        if (typeof this.onload === "function") this.onload({ target: this });
      }, 0);
    }
    // 保留 readAsDataURL 走真实实现（助手往返用例需要）
    readAsDataURL(blob) {
      const real = new RealFR();
      real.onload = () => {
        this.result = real.result;
        if (typeof this.onload === "function") this.onload({ target: this });
      };
      real.onerror = () => {
        if (typeof this.onerror === "function") this.onerror();
      };
      real.readAsDataURL(blob);
    }
  }
  win.FileReader = FakeFileReader;
}

function waitFor(predicate, timeout = 5000, interval = 20) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      let ok = false;
      try { ok = predicate(); } catch (e) { ok = false; }
      if (ok) return resolve(true);
      if (Date.now() - start > timeout) return reject(new Error("waitFor timeout"));
      setTimeout(tick, interval);
    };
    tick();
  });
}

describe("批次② P2-8 · 助手往返（Blob ⇄ dataURL）", () => {
  it("1: 256 字节 blob 往返字节保真、MIME 保留", async () => {
    const win = freshWin();
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const blob = new win.Blob([bytes], { type: "image/png" });

    const dataURL = await win._blobToDataURL(blob);
    expect(typeof dataURL).toBe("string");
    expect(dataURL).toMatch(/^data:image\/png;base64,/);

    const back = win._dataURLToBlob(dataURL);
    expect(back).toBeTruthy();
    expect(back.type).toBe("image/png");
    expect(back.size).toBe(256);
    // jsdom 的 Blob 未实现 arrayBuffer()（产品代码也不用它）→ 经 FileReader 读回字节
    const backBytes = await new Promise((resolve, reject) => {
      const fr = new win.FileReader();
      fr.onload = () => resolve(new Uint8Array(fr.result));
      fr.onerror = () => reject(new Error("readAsArrayBuffer failed"));
      fr.readAsArrayBuffer(back);
    });
    expect(backBytes.length).toBe(256);
    expect(backBytes[0]).toBe(0);
    expect(backBytes[128]).toBe(128);
    expect(backBytes[255]).toBe(255);
  });

  it("2: 非法输入守卫——非 dataURL 与无 base64 形态均返回 null", () => {
    const win = freshWin();
    expect(win._dataURLToBlob("not a url")).toBeNull();
    expect(win._dataURLToBlob("data:text/plain,hello")).toBeNull();
    expect(win._dataURLToBlob("")).toBeNull();
    expect(win._dataURLToBlob(null)).toBeNull();
  });
});

describe("批次② P2-8 · 无 IDB 环境降级契约", () => {
  it("3: doIdbExport 形状稳定——idbImages 恒存在（空对象），镜像键进 localStorage 段", async () => {
    const win = freshWin();
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t1" }]));
    stubDownload(win);

    const backup = await win.doIdbExport();

    expect(backup._type).toBe("idb-backup");
    expect(backup._version).toBe("1.1");
    expect(typeof backup.idbImages).toBe("object");
    expect(Object.keys(backup.idbImages).length, "无 IDB 时应为空对象而非 undefined").toBe(0);
    expect(backup.localStorage[PREFIX + "tasks"]).toBe(JSON.stringify([{ id: "t1" }]));
    expect(typeof backup.idbV2).toBe("object");
  });

  it("4: doIdbImport 对 idbImages 段整体跳过且如实计数；非镜像键不得注入 localStorage", async () => {
    const win = freshWin();
    const fileData = {
      _type: "idb-backup",
      _version: "1.1",
      _exportedAt: 1,
      localStorage: {
        [PREFIX + "tasks"]: JSON.stringify([{ id: "t-imported" }]),
        "wb_notify_enabled": "1",            // 非镜像键（旁路裸键）：idb-backup 通道不认
        "__dk_v2": "forged-device-key",      // 伪造设备密钥：必须被 idbShouldMirror 挡掉
      },
      idbV2: {},
      idbImages: {
        "img_e2ez01": "data:image/png;base64,aGVsbG8=",
        "__dk_v2": "data:text/plain;base64,aGk=",   // 伪造 kv 键：白名单拒绝
      },
    };
    stubImport(win, JSON.stringify(fileData));
    const toastSpy = vi.spyOn(win, "toast");
    win.doIdbImport({ name: "x.idbbackup" });

    await waitFor(() => toastSpy.mock.calls.length > 0);
    const msg = toastSpy.mock.calls.map((c) => c[0]).join(" | ");
    expect(msg, "无 IDB：仅 localStorage 镜像键可恢复，图片段跳过——计数必须如实为 1").toContain("已恢复 1 项数据");
    expect(win.localStorage.getItem("__dk_v2"), "伪造设备密钥不得进 localStorage").toBeNull();
    expect(win.localStorage.getItem("wb_notify_enabled"), "非镜像旁路键不被 idb-backup 通道接受").toBeNull();
    toastSpy.mockRestore();
  });
});
