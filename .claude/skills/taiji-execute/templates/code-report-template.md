---
title: {{title}}
tasks: {{tasks_path}}
status: completed | partial | failed
started: YYYY-MM-DD HH:MM
finished: YYYY-MM-DD HH:MM
author: {{author}}
---

# {{title}} Code Report

## 执行概览

| 项目 | 数据 |
|------|------|
| 总 Task 数 | {{total_tasks}} |
| 完成 | {{completed_tasks}} |
| 失败 | {{failed_tasks}} |
| 跳过 | {{skipped_tasks}} |
| 总测试用例 | {{total_tests}} |
| 测试通过 | {{passed_tests}} |
| 测试失败 | {{failed_tests}} |

## Task 执行明细

### Task 1：{{task_name}}
- **状态**：✅ 完成 / ❌ 失败 / ⏭️ 跳过
- **新增文件**：
  - `{{file_path}}`
- **修改文件**：
  - `{{file_path}}`
- **测试结果**：{{passed}}/{{total}} 通过
- **重试次数**：{{retry_count}}
- **备注**：{{notes}}

### Task 2：{{task_name}}
...

## 失败 Task 分析（如有）

### Task N：{{task_name}}
- **失败原因**：{{failure_reason}}
- **错误信息**：{{error_message}}
- **尝试的修复**：{{attempted_fixes}}
- **建议后续处理**：{{recommendation}}

## 验收结论

### Spec 验收标准覆盖

| 验收标准 | 对应 Task | 测试覆盖 | 结果 |
|---------|----------|---------|------|
| {{acceptance_criteria}} | Task {{task_id}} | {{test_method}} | ✅ 通过 / ❌ 未通过 / ⚠️ 部分通过 |

### 整体结论

- **是否可交付**：✅ 是 / ❌ 否（原因：{{reason}}）
- **遗留问题**：{{remaining_issues}}（无则填"无"）
- **建议后续**：{{recommendations}}（无则填"无"）

## Commit 建议

以下是建议的 commit 命令汇总：

```bash
# Task 1：{{task_name}}
git add {{files}}
git commit -m "{{commit_message}}"

# Task 2：{{task_name}}
git add {{files}}
git commit -m "{{commit_message}}"
```

## 变更记录
| 日期 | 作者 | 变更内容 |
|------|------|---------|
| {{created}} | {{author}} | 初始版本 |
