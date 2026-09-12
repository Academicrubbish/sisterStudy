# sisterStudy

为妹妹定制的学习机 App（安卓平板），替代商业学习机。基于 uni-app（Vue 3）+ uniCloud（支付宝小程序云）开发。

## 核心功能（规划）

- 拍照解题：苏格拉底式引导阶梯，先提示后答案
- 错题本：向量去重 + 错误根因标注
- 笔记归档：手写笔记拍照归档 + AI 知识点标注
- 出题工作流：联网搜真题优先，AI 生成兜底
- 间隔复习：SM-2 遗忘曲线调度
- 家长区：学情报告（口令进入）

## 文档

- 需求：[docs/sister-study/spec.md](docs/sister-study/spec.md)（父 spec + 5 子 spec）
- 需求推演草案：[docs/requirements-draft.md](docs/requirements-draft.md)
- 项目指令：[CLAUDE.md](CLAUDE.md)

## 开发

HBuilderX 打开项目根目录。当前处于 **M0 冒烟阶段**：验证 processOcr 云函数在新云空间的识别链路。

```bash
# 部署云函数（HBuilderX 内：右键 uniCloud-alipay/cloudfunctions/processOcr → 上传部署）
# 部署 schema（右键 uniCloud-alipay/database → 上传全部 DB Schema）
# 运行（HBuilderX → 运行 → 运行到手机或模拟器）
```

云函数依赖环境变量 `QWEN_API_KEY`（阿里云百炼 API Key），在 uniCloud 控制台配置。
