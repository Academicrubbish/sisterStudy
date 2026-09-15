<template>
	<view class="md-view">
		<mp-html :content="renderedHtml" :selectable="true" :show-img-menu="true" />
	</view>
</template>

<script>
import MarkdownIt from 'markdown-it'
import { renderLatexBatch } from '@/api/render.js'

// 共享单例：html 关闭（安全），breaks 开启（单换行也换行，贴合手写笔记习惯）
const md = new MarkdownIt({ html: false, breaks: true, linkify: false })

/** 公式占位符（§ 不参与任何 markdown 语法，安全） */
const FML_PLACEHOLDER = '§F{n}§'

/**
 * 公式保护：归一分隔符 + 抽取公式为占位符
 * 1) \(...\) → $...$、\[...\] → $$...$$（模型不守约定时兜底）
 * 2) $$..$$ 先抽（避免被 $..$ 拆碎），再抽 $..$
 * 公式绕过 markdown-it（防 _ * 等被吃成强调语法）
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
 * Markdown 渲染组件：
 * 公式保护管线 + markdown-it 解析 + 服务端 renderLatex 出 SVG 图片（mp-html 显示）
 * 公式渲染失败时降级为源码文本显示，不阻塞正文
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
	data() {
		return {
			renderedHtml: '',
			// 渲染令牌：content 快速变化时丢弃过期结果
			renderToken: 0
		}
	},
	watch: {
		content: {
			immediate: true,
			handler() {
				this.render()
			}
		}
	},
	methods: {
		async render() {
			const src = this.content || ''
			if (!src) {
				this.renderedHtml = ''
				return
			}
			const token = ++this.renderToken
			const { text, formulas } = extractFormulas(src)
			const html = md.render(text)

			const replaceFormulas = (mapper) => {
				return html.replace(/§F(\d+)§/g, (m, i) => mapper(Number(i), formulas[i]))
			}

			if (!formulas.length) {
				this.renderedHtml = html
				return
			}

			// 第一步：先以源码文本形式立即展示（加载态）
			this.renderedHtml = replaceFormulas((i, f) => escapeFormula(f))

			// 第二步：批量渲染 SVG 替换（带令牌防过期覆盖）
			try {
				const uris = await renderLatexBatch(formulas)
				if (token !== this.renderToken) return
				this.renderedHtml = replaceFormulas((i, f) => {
					const uri = uris[i]
					if (!uri) return escapeFormula(f) // 渲染失败降级源码
					const isDisplay = f.slice(0, 2) === '$$'
					const style = isDisplay
						? 'display:block;margin:8px auto;max-width:100%'
						: 'max-width:100%;vertical-align:middle'
					return '<img src="' + uri + '" style="' + style + '" />'
				})
			} catch (e) {
				console.error('[md-view] 公式渲染失败，保留源码显示：', e.message)
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
