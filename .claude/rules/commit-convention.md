# Commit 规范

格式：`<type>(<scope>): <subject>`

## type 取值
- `feat`: 新功能
- `fix`: 修复 bug
- `refactor`: 重构（不改变外部行为）
- `docs`: 文档变更
- `style`: 样式调整（不影响逻辑）
- `chore`: 构建/工具/依赖相关
- `perf`: 性能优化

## scope 取值
- `setup`: 项目初始化/模板清理/工程配置
- `camera`: 拍照识题/OCR 链路
- `solve`: 拍照解题（引导阶梯）
- `wrongbook`: 错题本
- `note`: 笔记归档
- `exercise`: 出题工作流/练习作答
- `review`: 间隔复习（SM-2）
- `analysis`: 薄弱点分析
- `parent`: 家长区
- `render`: Markdown/公式渲染
- `cloud`: 云函数/数据库/触发器
- `api`: 数据接口层
- `ui`: 页面/组件/样式
- `utils`: 工具函数

## 示例
```
feat(solve): 拍照解题引导阶梯状态机实现
feat(exercise): 出题工作流接入联网搜真题
fix(cloud): processSolution 拆分结果字段名修正
chore(setup): 清理 hello uniCloud 模板演示代码
```

## 要求
- subject 使用中文，简明扼要，不超过 50 字
- subject 说明"做了什么"，不需要加"的"字结尾
