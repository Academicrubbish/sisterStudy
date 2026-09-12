# 代码风格规则

## 通用
- 使用 `const`/`let`，禁止 `var`
- 变量命名使用 camelCase，常量使用 UPPER_SNAKE_CASE
- 函数/方法不超过 80 行，超过则拆分
- 单个 Vue 文件不超过 500 行，超过则提取子组件
- 所有导出函数必须有 JSDoc 注释

## Vue 组件
- **Vue 3 + 选项式 API（Options API）**——与开发者 Toolbox 项目习惯保持一致，降低双项目维护成本
- 组件结构顺序：`template` → `script` → `style`
- `data()` 中属性按功能分组，添加注释
- `methods` 按功能分组，相关方法放一起
- `computed` 用于派生状态，不产生副作用；`watch` 用于响应数据变化执行副作用
- 组件 props 必须定义类型和默认值
- 组件事件使用 kebab-case（`@card-tap`、`@reveal-next`）

## API 层
- 每个数据库集合对应一个文件（`api/<collection>.js`）
- 使用 `getRequest()` 延迟初始化数据库连接，避免模块加载时 uniCloud 未就绪
- **单用户单设备，无登录体系**——不使用 `withAuth`，所有请求附带本地缓存的 `uid`（首次启动 registerDevice 生成）
- 涉及付费 AI 接口的操作一律走云函数，客户端只写任务队列
- 导出命名使用动词开头：`getQuestionList`、`addQuestion`、`delNote`

## 样式
- 使用 `rpx` 单位
- 公共样式放 `App.vue` 的 `<style>` 中，组件样式使用 `scoped`
- 优先使用设计 tokens（`styles/tokens.scss`，沿用 Toolbox ui-redesign 的 tokens 思路）统一颜色/圆角/间距
- 面向初中生用户：字号偏大、点击区域 ≥ 88rpx、对比度充足

## 页面组织
- App 端不使用分包，页面按功能目录组织：`pages/<feature>/`
- 静态资源按功能放在 `static/<feature>/` 下
- 拍照相关页面注意横竖屏适配（平板使用场景）
