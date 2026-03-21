# 第五层：图片处理

> 最后更新：2026-03-20

---

## 5.1 图片分析

| 项目 | 内容 |
|------|------|
| 做什么 | 用视觉模型分析用户上传的图片 |
| 文件 | `oct-gateway/image_analyzer.js` |
| 调用链 | 前端上传图片 → index.js 检测图片消息 → imageAnalyzer 调用视觉模型 API |
| 配置 | `config.image_analysis.provider`（默认 aliyun_vl）、`vision_model`（默认 qwen-vl-max） |
| 状态 | ✅ 正常 |
