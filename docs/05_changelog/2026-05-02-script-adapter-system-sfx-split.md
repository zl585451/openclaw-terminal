# Script Adapter 系统音与 SFX 分流

- 日期：2026-05-02
- 范围：内容创作工作台 / Gateway 文本改编链路

## 变更

1. `voiceTypeClassifier` 新增 `system_voice`、`device_voice`、`sfx` 的细分边界。
2. `spanScriptComposer` 会把 `系统音 + 纯拟声词` 自动纠偏为 `SFX`。
3. `quoteAttributionAgent` 行协议提示词允许输出 `device_voice` / `sfx`，并明确纯拟声词不得标为系统音。
4. `voiceClassifierAgent` 在角色音表中仍把功能声音归为 `category = sfx`，但保留 `系统音`、`对讲机`、`SFX` 的 roleName 区别。
5. `basicQCChecker` 新增 `[系统音] 咔/咚/滋啦` 混淆检查。
6. 前端导出层对旧产物做兜底：纯拟声词即使被上游标为 `系统音`，导出时也显示为 `SFX`。

## 验收

- `[系统音] 叮，系统已激活` 保持系统提示。
- `[对讲机] 滋啦……` 保持设备传声。
- `[系统音] 咚` 自动纠偏或被 QC 标记，目标显示为 `[SFX] 咚`。

