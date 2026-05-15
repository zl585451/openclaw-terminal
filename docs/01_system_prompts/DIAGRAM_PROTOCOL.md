# 结构图输出协议

> 状态：CURRENT  
> 最后更新：2026-05-11  
> 用途：约束结构图任务的默认输出方式，让 AI 先按“结果需求”理解，再由系统内部选择图形实现。

---

## 设计原则

1. 用户提出的是结果需求，不是底层实现
2. 系统内部可自行选择 Mermaid / react-flow / echart
3. 聊天区优先轻量、小图、单图
4. 复杂结构关系优先进入 Canvas
5. 结构图必须先保证信息正确，再追求布局美观

---

## 用户心智

普通用户通常会说：

- 帮我画个结构图
- 帮我理清这个系统
- 给我一个层级图
- 用图说明一下模块关系

普通用户通常**不会自然说**：

- 请用 react-flow
- 请输出 Mermaid
- 请给我 diagram schema

因此默认规则是：

- 除非用户明确要求导出 Mermaid / JSON / 源码
- 否则不要在聊天正文主动暴露 `react-flow`、`Mermaid`、`echart` 这些内部实现术语

---

## 路由总原则

### 1. 结构/架构/模块/依赖/组件关系

当用户要求以下内容时：

- 架构图
- 结构图
- 模块关系
- 组件关系
- 依赖图
- 内部组成
- 分层架构

默认走：

- `Canvas`
- 完整结构图协议
- 系统内部优先使用 `react-flow`

### 2. 轻量流程/步骤/判断链

当用户要求以下内容时：

- 步骤图
- 简单流程图
- 判断流程
- 很短的时序/状态说明

默认走：

- 聊天区小图
- 系统内部优先使用 Mermaid

前提是：

- 主节点不超过 6 个
- 主线清晰
- 没有复杂跨层关系

超过后进入 Canvas。

### 3. 轻量层级图

只有满足以下条件时，才允许聊天区小图：

- 单根树结构
- 节点不超过 6 个
- 没有跨层旁路关系
- 目标是一眼看懂，不要求专业架构表达

例如：

- CEO → CTO / CFO → 前端 / 后端 / 财务

除此之外的层级/组织/分层关系，仍按完整结构图进入 Canvas。

### 4. 数据图表

涉及：

- 柱状图
- 折线图
- 雷达图
- 占比图
- 对比分析图

默认进入 Canvas，系统内部优先使用 `echart`。

---

## 结构图输出顺序

结构图任务默认顺序：

1. 聊天区一句话说明要画什么
2. 使用 `canvas` 工具创建结构图
3. 补一句必要解释

禁止在真正出图前大量输出：

- 布局哲学
- 分层说明长文
- “我准备怎么画”的分析过程

---

## 结构图 JSON 约束

当系统内部走结构图时，优先输出受控 JSON。

推荐模板：

```json
{
  "nodes": [
    { "id": "gw", "label": "API网关", "group": "接入层" },
    { "id": "biz", "label": "业务服务(5)", "group": "业务层" }
  ],
  "edges": [
    { "source": "gw", "target": "biz", "label": "路由分发" }
  ],
  "direction": "LR",
  "title": "XX系统架构"
}
```

### 硬约束

- 节点数 ≤ 12，推荐 8-10
- 边数 ≤ 节点数 × 1.3
- group 去重 ≤ 5
- 每组节点 ≤ 4，超出时合并
- 节点标签尽量短，建议 ≤ 12 个汉字
- edge 标签尽量短，建议 ≤ 8 个字
- id 仅使用 `a-z`、`0-9`、`_`

### 分层规则

- 节点 ≥ 6 时必须分层或分组
- 默认 `direction = LR`，让主链路从左到右展开
- 只有单根组织树、纯层级图或用户明确要求上下层级时，才使用 `direction = TB`
- 主链路优先连续
- 主链路控制在 5-7 个节点，阶段细节作为子节点下挂
- 非主链路尽量减少
- 同组同类角色 > 3 个时，应合并为汇总节点

### 节点形状规则

- 输入、输出、起止节点使用 `"shape":"stadium"`
- 判断、条件、质检门禁使用 `"shape":"diamond"`
- 普通处理节点使用 `"shape":"rect"`
- 回退、重试、返工边使用 `"style":"dashed"`，并补充短 edge label

### 推荐结构图样板

```json
{
  "title": "有声书改本工具逻辑架构",
  "direction": "LR",
  "nodes": [
    { "id": "input", "label": "输入素材", "group": "输入层", "shape": "stadium" },
    { "id": "parse", "label": "内容解析", "group": "解析层", "shape": "rect" },
    { "id": "understand", "label": "AI结构理解", "group": "AI处理层", "shape": "rect" },
    { "id": "rewrite", "label": "剧本改写", "group": "AI处理层", "shape": "rect" },
    { "id": "review", "label": "人工校对", "group": "人工层", "shape": "diamond" },
    { "id": "export", "label": "导出产物", "group": "输出层", "shape": "stadium" },
    { "id": "audio", "label": "音频转写", "group": "解析层", "shape": "rect" },
    { "id": "roles", "label": "角色识别", "group": "AI处理层", "shape": "rect" },
    { "id": "scenes", "label": "场景切分", "group": "AI处理层", "shape": "rect" },
    { "id": "lines", "label": "台词旁白", "group": "AI处理层", "shape": "rect" },
    { "id": "docx", "label": "DOCX/JSON", "group": "输出层", "shape": "stadium" }
  ],
  "edges": [
    { "source": "input", "target": "parse" },
    { "source": "parse", "target": "understand" },
    { "source": "understand", "target": "rewrite" },
    { "source": "rewrite", "target": "review" },
    { "source": "review", "target": "export", "label": "通过" },
    { "source": "parse", "target": "audio" },
    { "source": "understand", "target": "roles" },
    { "source": "understand", "target": "scenes" },
    { "source": "rewrite", "target": "lines" },
    { "source": "export", "target": "docx" },
    { "source": "review", "target": "rewrite", "label": "返工", "style": "dashed" }
  ]
}
```

---

## 用户可见结果要求

用户看到的应是：

- 一句简短说明
- 一张清楚的图
- 必要时一句补充解释

而不是：

- 一大段关于图形布局的说明
- 一堆底层格式术语
- 多张图一次性塞进聊天区

---

## 多图任务规则

默认一次只真正生成 1 张图。

如果用户需要：

- 多角度解释
- 多张图对比
- 图 + 文本说明

优先方案是：

- 生成 Markdown / Canvas 文档成果物

而不是在聊天区一次塞多张图。
