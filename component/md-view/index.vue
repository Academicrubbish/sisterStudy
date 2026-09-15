<template>
	<view class="md-view">
		<mp-html :content="html" :selectable="true" :show-img-menu="true" />
	</view>
</template>

<script>
import MarkdownIt from 'markdown-it'

// 共享单例：html 关闭（安全），breaks 开启（单换行也换行，贴合手写笔记习惯）
const md = new MarkdownIt({ html: false, breaks: true, linkify: false })

/** 公式占位符（§ 不参与任何 markdown 语法，安全） */
const FML_PLACEHOLDER = '§F{n}§'

/**
 * 公式保护：归一分隔符 + 抽取公式为占位符
 * 1) \(...\) → $...$、\[...\] → $$...$$（模型不守约定时兜底）
 * 2) $$..$$ 先抽（避免被 $..$ 拆碎），再抽 $..$
 * 公式绕过 markdown-it（防 _ * 等被吃成强调语法），渲染后原样放回
 * @param {string} src Markdown 源文本
 * @returns {{text: string, formulas: string[]}}
 */
function extractFormulas(src) {
	const formulas = []
	let text = String(src)
		.replace(/\\\[([\s\S]+?)\\\]/g, (m, f) => '$$' + f + '$$')
		.replace(/\\\(([\s\S]+?)\\\)/g, (m, f) => '$' + f + '$')
	text = text.replace(/\$\$([\s\S]+?)\$\$/g, (m, f) => {
		formulas.push('$$' + f + '$$')
		return FML_PLACEHOLDER.replace('{n}', formulas.length - 1)
	})
	text = text.replace(/\$([^$\n]+?)\$/g, (m, f) => {
		formulas.push('$' + f + '$')
		return FML_PLACEHOLDER.replace('{n}', formulas.length - 1)
	})
	return { text, formulas }
}

/** 公式文本放回 HTML 前转义（LaTeX 中的 < > & 不能裸进 HTML） */
function escapeFormula(f) {
	return f.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Markdown 渲染组件：公式保护管线 + markdown-it 解析 + mp-html 渲染（latex 插件画公式）
 * 全场景共用（解题引导/错题详情/笔记详情/同类练习）
 */
export default {
	name: 'md-view',
	props: {
		// Markdown 源文本
		content: {
			type: String,
			default: ''
		}
	},
	computed: {
		/** 解析后的 HTML；解析异常时降级为转义纯文本 */
		html() {
			if (!this.content) return ''
			try {
				const { text, formulas } = extractFormulas(this.content)
				let html = md.render(text)
				html = html.replace(/§F(\d+)§/g, (m, i) => {
					const f = formulas[Number(i)]
					return f ? escapeFormula(f) : ''
				})
				return html
			} catch (e) {
				console.error('[md-view] 解析失败，降级纯文本：', e.message)
				return this.content.replace(/&/g, '&amp;').replace(/</g, '&lt;')
			}
		}
	}
}
</script>

<style scoped>
.md-view {
	font-size: 30rpx;
	line-height: 1.7;
	color: #333;
}
</style>
