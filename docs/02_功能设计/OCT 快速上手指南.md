# OCT 快速上手指南

> 若你看到 **连接失败** 或 **ECONNREFUSED 127.0.0.1:18789**，按下面步骤操作即可。

---

## 第一步：修复配置（若有问题）

若你曾点击过「安装 Nocturne 依赖」或系统之前报过 `Config invalid`，请先修复配置：

1. 打开 **设置**（点击 ⚙ SETTINGS）
2. 找到 **Gateway 配置修复** 区块
3. 点击 **「修复 openclaw.json 配置」**
4. 若弹出「已修复」提示，继续下一步

---

## 第二步：启动 Gateway

Gateway 是对话的后端服务，**必须运行**才能和 AI 对话。

1. 看右侧面板 **Gateway 日志** 区域
2. 点击 **▶ 启动** 按钮
3. 等待几秒，顶部状态应由 `DISCONNECTED` 变为 `CONNECTED`

若你看到「● 已连接」或「● 外部运行」，说明 Gateway 已在运行，可跳过此步。

---

## 第三步：配置 API Key（首次使用）

在 **设置** 中填写你的大模型 API Key：

- **阿里云百炼**：从 [阿里云百炼控制台](https://bailian.console.aliyun.com/) 获取
- **DeepSeek**：作为备选模型

填写后点击 **「保存并重新连接」**。

---

## 完成

完成后，OCT 应显示 **CONNECTED**，此时可以正常与 AMY 对话。

---

## 若仍失败

1. 查看右侧 **Gateway 日志** 区的红色错误信息
2. 确认本机已安装 **Node.js 20+**（OpenClaw 需要）
3. 确认 **API Key** 已正确填写且有效
