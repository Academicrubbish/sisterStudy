<template>
	<view class="md-view">
		<mp-html :content="html" :selectable="true" :show-img-menu="true" />
	</view>
</template>

<script>
import MarkdownIt from 'markdown-it'

// 共享单例：html 关闭（安全），breaks 开启（单换行也换行，贴合手写笔记习惯）
const md = new MarkdownIt({ html: false, breaks: true, linkify: false })

/**
 * Markdown 渲染组件：markdown-it 解析 → mp-html 渲染（latex 插件处理 $...$ 公式）
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
				return md.render(this.content)
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
