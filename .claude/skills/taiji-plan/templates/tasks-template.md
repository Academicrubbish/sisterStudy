---
title: {{title}}
plan: {{plan_path}}
status: draft
created: {{created}}
updated: {{updated}}
author: {{author}}
---

# {{title}} Tasks

> 完成标准：每个 Task 的实现内容完成 + 测试用例全部通过。

## Task 列表

### Task 1：{{task_name}}（对应 Plan {{stage_step_ref}}）
- **操作类型**：新增 / 修改 / 删除
- **涉及文件**：
  - `{{file_path}}`（新增/修改）
- **实现内容**：
  - {{implementation_detail}}
- **测试用例**：
  - 用例 1：{{scenario}} → {{expected_result}}
  - 用例 2：{{scenario}} → {{expected_result}}
- **依赖**：{{dependency}}

### Task 2：{{task_name}}（对应 Plan {{stage_step_ref}}）
- **操作类型**：新增 / 修改 / 删除
- **涉及文件**：
  - `{{file_path}}`（新增/修改）
- **实现内容**：
  - {{implementation_detail}}
- **测试用例**：
  - 用例 1：{{scenario}} → {{expected_result}}
- **依赖**：{{dependency}}

## 变更记录
| 日期 | 作者 | 变更内容 |
|------|------|---------|
| {{created}} | {{author}} | 初始版本 |
