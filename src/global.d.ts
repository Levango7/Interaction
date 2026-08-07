// 架构项③：全局类型增强声明（Window 扩展，供 checkJs 渐进类型化使用）

interface ElectronAPI {
  chatOnce(payload: any): Promise<any>;
  /** 兼容旧调用名 */
  chat?(payload: any): Promise<any>;
  getAiConfig(): Promise<any>;
  setAiConfig(cfg: any): Promise<any>;
  clearAiConfig(): Promise<any>;
  getAutoLaunch(): Promise<boolean>;
  setAutoLaunch(on: boolean): Promise<any>;
}

interface Window {
  /** Electron preload 注入的桥接 API（浏览器环境不存在） */
  electronAPI?: ElectronAPI;
  /** 测试钩子（仅本地/测试上下文挂载，见 31-bootstrap-test-export.js） */
  __test?: Record<string, any>;
}
